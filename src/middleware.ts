import { RawContractError, type Transport } from "viem";
import type { TraceCallRpcSchema } from "./actions/traceCall.js";
import { formatFullTrace } from "./format.js";

export type TracerConfig = {
  all: boolean;
  next: boolean;
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
  { all = true, next = false }: Partial<TracerConfig> = {},
): TracedTransport<transport> {
  // @ts-ignore: complex overload
  return (...config) => {
    const instance = transport(...config) as ReturnType<TracedTransport<transport>>;

    instance.value = {
      ...instance.value,
      tracer: { all, next },
    };

    return {
      ...instance,
      async request(args, options) {
        const { method, params } = args;

        const traceCall = async () => {
          const trace = await instance.request<TraceCallRpcSchema>(
            {
              method: "debug_traceCall",
              params: [
                // @ts-ignore: params[0] is the rpc transaction request
                params[0],
                // @ts-ignore: params[1] is either undefined or the block identifier
                params[1] || "latest",
                { tracer: "callTracer" },
              ],
            },
            { retryCount: 0 },
          );

          return await formatFullTrace(trace);
        };

        switch (method) {
          case "eth_estimateGas":
          case "eth_sendTransaction": {
            if (instance.value?.tracer.next) {
              instance.value.tracer.next = false;

              try {
                console.log(await traceCall());
              } catch (error) {
                console.warn(`Failed to trace transaction: ${error}`);
              }
            }

            break;
          }
        }

        return instance.request(args, options).catch(async (error) => {
          switch (method) {
            case "eth_estimateGas":
            case "eth_sendTransaction": {
              if (instance.value?.tracer.all) {
                throw new RawContractError({ message: `\n${await traceCall()}` });
              }

              break;
            }
          }

          throw error;
        });
      },
    };
  };
}
