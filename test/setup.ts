import { disable } from "colors";
import type { Client, HDAccount, HttpTransport, PublicActions, TestActions, TestRpcSchema, WalletActions } from "viem";
import { http, createTestClient, publicActions, walletActions } from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { mainnet } from "viem/chains";
import { test as vitest } from "vitest";
import { type TraceActions, type TracedTransport, traceActions, traced } from "../src/index.js";
import { spawnAnvil } from "./anvil.js";
import { testAccount } from "./fixtures.js";

// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

disable();

declare global {
  namespace NodeJS {
    interface Process {
      __tinypool_state__: {
        isChildProcess: boolean;
        isTinypoolWorker: boolean;
        workerData: null;
        workerId: number;
      };
    }
  }
}

export const test = vitest.extend<{
  client: Client<
    TracedTransport<HttpTransport>,
    typeof mainnet,
    HDAccount,
    TestRpcSchema<"anvil">,
    TestActions &
      DealActions<HDAccount> &
      TraceActions<typeof mainnet> &
      PublicActions<TracedTransport<HttpTransport>, typeof mainnet, HDAccount> &
      WalletActions<typeof mainnet, HDAccount>
  >;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
  client: async ({}, use) => {
    const { rpcUrl, stop } = await spawnAnvil({
      forkUrl: process.env.MAINNET_RPC_URL || mainnet.rpcUrls.default.http[0],
      forkBlockNumber: 20_884_340,
      stepsTracing: true,
    });

    await use(
      createTestClient({
        chain: mainnet,
        mode: "anvil",
        account: testAccount(),
        transport: traced(http(rpcUrl)),
      })
        .extend(dealActions)
        .extend(publicActions)
        .extend(walletActions)
        .extend(traceActions),
    );

    await stop();
  },
});
