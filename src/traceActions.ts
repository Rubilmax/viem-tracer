import type { Chain, Client, Transport } from "viem";
import { type RpcCallTrace, type TraceCallParameters, traceCall } from "./actions/traceCall.js";

export type TraceActions<chain extends Chain | undefined = Chain | undefined> = {
  /**
   * Traces a call.
   *
   * @param args - {@link TraceCallParameters}
   *
   * @example
   * import { createClient, http } from 'viem'
   * import { mainnet } from 'viem/chains'
   * import { traceActions } from 'viem-tracer'
   *
   * const client = createClient({
   *   chain: mainnet,
   *   transport: http(),
   * }).extend(traceActions)
   * await client.traceCall({
   *   account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
   *   to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
   *   value: parseEther('1'),
   * })
   */
  traceCall: (args: TraceCallParameters<chain>) => Promise<RpcCallTrace>;
};

export function traceActions<chain extends Chain | undefined>(client: Client<Transport, chain>): TraceActions<chain> {
  return {
    traceCall: (args) => traceCall(client, args),
  };
}
