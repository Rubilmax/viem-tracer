import {
  BaseError,
  type Hash,
  type RpcTransactionReceipt,
  type RpcTransactionRequest,
  type Transport,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import type { TraceCallRpcSchema } from "./actions/traceCall";
import { type TraceFormatConfig, formatFullTrace } from "./format";

export type TracerConfig = TraceFormatConfig & {
  /**
   * Whether to trace all transactions. Defaults to `false`.
   */
  all: boolean;
  /**
   * Whether to trace the next submitted transaction. Defaults to `undefined`.
   */
  next?: boolean;
  /**
   * Whether to trace all failed transactions. Defaults to `true`.
   */
  failed: boolean;
};

export type TracedTransport<transport extends Transport = Transport> = transport extends Transport<
  infer type,
  infer rpcAttributes,
  infer eip1193RequestFn
>
  ? Transport<
      type,
      rpcAttributes & {
        tracer: TracerConfig;
      },
      eip1193RequestFn
    >
  : never;

export class ExecutionRevertedTraceError extends BaseError {
  static code = 3;
  static nodeMessage = /execution reverted/;

  constructor(trace: string, reason?: string) {
    super(`Execution reverted ${reason ? `with reason: ${reason}` : "for an unknown reason"}.`, {
      name: "ExecutionRevertedError",
      details: `\n${trace}`,
    });
  }
}

/**
 * @description Overloads a transport intended to be used with a test client, to trace and debug transactions.
 */
export function traced<transport extends Transport>(
  transport: transport,
  { all = false, next, failed = true, gas, raw }: Partial<TracerConfig> = {},
): TracedTransport<transport> {
  // @ts-ignore: complex overload
  return (...config) => {
    const instance = transport(...config) as ReturnType<TracedTransport<transport>>;

    instance.value = {
      ...instance.value,
      tracer: { all, next, failed, gas, raw },
    };

    return {
      ...instance,
      async request(args, options) {
        const { method, params } = args;
        if (method !== "eth_estimateGas" && method !== "eth_sendTransaction" && method !== "wallet_sendTransaction")
          return instance.request(args, options);

        const { tracer } = instance.value!;

        // @ts-expect-error: params[0] is the rpc transaction request
        const tx = params[0] as RpcTransactionRequest;

        const traceCall = async () => {
          const trace = await instance.request<TraceCallRpcSchema>(
            {
              method: "debug_traceCall",
              params: [
                tx,
                // @ts-expect-error: params[1] is either undefined or the block identifier
                params[1] || "latest",
                {
                  // @ts-expect-error: params[2] may contain state and block overrides
                  ...params[2],
                  tracer: "callTracer",
                  tracerConfig: {
                    onlyTopCall: false,
                    withLog: true,
                  },
                },
              ],
            },
            { retryCount: 0 },
          );

          return new ExecutionRevertedTraceError(await formatFullTrace(trace, tracer), trace.revertReason);
        };

        if (tracer.next || (tracer.next == null && tracer.all)) {
          try {
            console.log((await traceCall()).details);
          } catch (error) {
            console.warn(`Failed to trace transaction: ${error}`);
          }
        }

        const res = await instance
          .request(args, options)
          .catch(async (error) => {
            if (tracer.next || (tracer.next == null && tracer.failed)) {
              const trace = await traceCall();

              trace.stack = error.stack;

              throw trace;
            }

            throw error;
          })
          .finally(() => {
            tracer.next = undefined;
          });

        if (method !== "eth_estimateGas") {
          let receipt: RpcTransactionReceipt | null = null;

          try {
            for (let i = 0; i < 720; i++) {
              receipt = await instance.request({
                method: "eth_getTransactionReceipt",
                params: [res],
              });

              if (receipt) break;

              await new Promise((resolve) => setTimeout(resolve, 250));
            }

            if (!receipt) throw new WaitForTransactionReceiptTimeoutError({ hash: res as Hash });
            if (receipt.status === "0x0") throw await traceCall();
          } catch (error) {
            if (error instanceof ExecutionRevertedTraceError) throw error;

            console.warn(`Failed to trace transaction: ${error}`);
          }
        }

        return res;
      },
    };
  };
}
