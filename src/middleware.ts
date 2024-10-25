import { RawContractError, type Transport } from "viem";
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
  infer rpcAttributes
>
  ? Transport<
      type,
      rpcAttributes & {
        tracer: TracerConfig;
      }
    >
  : never;

/**
 * @description Overloads a transport intended to be used with a test client, to trace and debug transactions.
 */
export function traced<transport extends Transport>(
  transport: transport,
  { all = false, next, failed = true, gas = false }: Partial<TracerConfig> = {},
): TracedTransport<transport> {
  // @ts-ignore: complex overload
  return (...config) => {
    const instance = transport(...config) as ReturnType<TracedTransport<transport>>;

    instance.value = {
      ...instance.value,
      tracer: { all, next, failed, gas },
    };

    return {
      ...instance,
      async request(args, options) {
        switch (args.method) {
          case "eth_estimateGas":
          case "eth_sendTransaction": {
            const { params } = args;
            const { tracer } = instance.value!;

            const traceCall = async () => {
              const trace = await instance.request<TraceCallRpcSchema>(
                {
                  method: "debug_traceCall",
                  params: [
                    // @ts-ignore: params[0] is the rpc transaction request
                    params[0],
                    // @ts-ignore: params[1] is either undefined or the block identifier
                    params[1] || "latest",
                    {
                      // @ts-ignore: params[2] may contain state and block overrides
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

              return await formatFullTrace(trace, tracer);
            };

            if (tracer.next || (tracer.next == null && tracer.all)) {
              try {
                console.log(await traceCall());
              } catch (error) {
                console.warn(`Failed to trace transaction: ${error}`);
              }
            }

            return instance
              .request(args, options)
              .catch(async (error) => {
                if (tracer.next || (tracer.next == null && tracer.failed)) {
                  throw new RawContractError({ message: `\n${await traceCall()}` });
                }

                throw error;
              })
              .finally(() => {
                tracer.next = undefined;
              });
          }
          default:
            return instance.request(args, options);
        }
      },
    };
  };
}
