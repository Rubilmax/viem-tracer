import { createClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import { traceCall } from "../src/actions/traceCall";

const address = "0x0000000000000000000000000000000000000001" as const;

test("serializes stateOverride for debug_traceCall", async () => {
  let traceRequest: readonly unknown[] | undefined;
  const client = createClient({
    chain: mainnet,
    transport: custom({
      request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
        if (method === "debug_traceCall") {
          traceRequest = params;
          return {
            from: address,
            gas: "0x0",
            gasUsed: "0x0",
            to: address,
            input: "0x",
            output: "0x",
            type: "CALL",
          };
        }
        return "0x0";
      },
    }),
  });

  await traceCall(client, {
    to: address,
    gas: 21_000n,
    nonce: 0,
    stateOverride: [
      {
        address,
        balance: 1n,
        stateDiff: [{ slot: "0x01", value: "0x02" }],
      },
    ],
  });

  expect(traceRequest).toEqual([
    expect.any(Object),
    "latest",
    {
      tracer: "callTracer",
      tracerConfig: undefined,
      stateOverrides: {
        [address]: {
          balance: "0x1",
          nonce: undefined,
          code: undefined,
          state: undefined,
          stateDiff: { "0x01": "0x02" },
        },
      },
    },
  ]);
});
