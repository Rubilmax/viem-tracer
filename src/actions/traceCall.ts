import type { AssertRequestParameters } from "node_modules/viem/_types/utils/transaction/assertRequest";
import {
  type Account,
  type Address,
  BaseError,
  type BlockTag,
  type Chain,
  type Client,
  type ExactPartial,
  type FormattedTransactionRequest,
  type Hex,
  type RpcTransactionRequest,
  type TransactionRequest,
  type Transport,
  type UnionOmit,
  assertRequest,
  formatTransactionRequest,
  numberToHex,
} from "viem";
import { parseAccount } from "viem/accounts";
import { prepareTransactionRequest } from "viem/actions";
import { recoverAuthorizationAddress } from "viem/experimental";
import { extract, getTransactionError } from "viem/utils";

export type TraceCallRpcSchema = {
  Method: "debug_traceCall";
  Parameters:
    | [ExactPartial<RpcTransactionRequest>, Hex | BlockTag]
    | [
        ExactPartial<RpcTransactionRequest>,
        BlockTag | Hex,
        {
          tracer: "callTracer" | "prestateTracer";
          tracerConfig?: { onlyTopCall?: boolean; withLog?: boolean };
        },
      ];
  ReturnType: RpcCallTrace;
};

export type RpcCallType = "CALL" | "STATICCALL" | "DELEGATECALL" | "CREATE" | "CREATE2" | "SELFDESTRUCT" | "CALLCODE";

export type RpcLogTrace = {
  address: Address;
  data: Hex;
  position: Hex;
  topics: [Hex, ...Hex[]];
};

export type RpcCallTrace = {
  from: Address;
  gas: Hex;
  gasUsed: Hex;
  to: Address;
  input: Hex;
  output: Hex;
  error?: string;
  revertReason?: string;
  calls?: RpcCallTrace[];
  logs?: RpcLogTrace[];
  value?: Hex;
  type: RpcCallType;
};

export type TraceCallParameters<chain extends Chain | undefined = Chain | undefined> = UnionOmit<
  FormattedTransactionRequest<chain>,
  "from"
> & {
  account?: Account | Address | undefined;
  tracer?: "callTracer" | "prestateTracer";
  tracerConfig?: { onlyTopCall?: boolean };
} & (
    | {
        blockNumber?: bigint | undefined;
        blockTag?: undefined;
      }
    | {
        blockNumber?: undefined;
        blockTag?: BlockTag | undefined;
      }
  );

/**
 * Traces a call.
 *
 * - JSON-RPC Methods: [`debug_traceCall`](https://www.quicknode.com/docs/ethereum/debug_traceCall)
 *
 * @param client - Client to use
 * @param parameters - {@link TraceCallParameters}
 * @returns The call trace. {@link RpcCallTrace}
 *
 * @example
 * import { createPublicClient, http, parseEther } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { traceCall } from 'viem-tracer'
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * })
 * const gasEstimate = await traceCall(client, {
 *   account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
 *   to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
 *   value: parseEther('1'),
 * })
 */
export async function traceCall<chain extends Chain | undefined>(
  client: Client<Transport, chain>,
  { tracer = "callTracer", tracerConfig, ...args }: TraceCallParameters<chain>,
) {
  const account_ = args.account ?? client.account;
  const account = account_ ? parseAccount(account_) : null;

  try {
    const {
      accessList,
      authorizationList,
      blobs,
      blobVersionedHashes,
      blockNumber,
      blockTag = "latest",
      data,
      gas,
      gasPrice,
      maxFeePerBlobGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      value,
      ...tx
    } = (await prepareTransactionRequest(client, {
      // biome-ignore lint/suspicious/noExplicitAny: not inferred correctly
      ...(args as any),
      parameters: ["blobVersionedHashes", "chainId", "fees", "nonce", "type"],
    })) as TraceCallParameters;

    const blockNumberHex = blockNumber ? numberToHex(blockNumber) : undefined;
    const block = blockNumberHex || blockTag;

    const to = await (async () => {
      // If `to` exists on the parameters, use that.
      if (tx.to) return tx.to;

      // If no `to` exists, and we are sending a EIP-7702 transaction, use the
      // address of the first authorization in the list.
      if (authorizationList && authorizationList.length > 0)
        return await recoverAuthorizationAddress({
          authorization: authorizationList[0]!,
        }).catch(() => {
          throw new BaseError("`to` is required. Could not infer from `authorizationList`");
        });

      // Otherwise, we are sending a deployment transaction.
      return undefined;
    })();

    assertRequest(args as AssertRequestParameters);

    const chainFormat = client.chain?.formatters?.transactionRequest?.format;
    const format = chainFormat || formatTransactionRequest;

    const request = format({
      // Pick out extra data that might exist on the chain's transaction request type.
      ...extract(tx, { format: chainFormat }),
      from: account?.address,
      accessList,
      authorizationList,
      blobs,
      blobVersionedHashes,
      data,
      gas,
      gasPrice,
      maxFeePerBlobGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      to,
      value,
    } as TransactionRequest);

    const trace = await client.request<TraceCallRpcSchema>(
      {
        method: "debug_traceCall",
        params: [request, block, { tracer, tracerConfig }],
      },
      { retryCount: 0 },
    );

    return trace;
  } catch (err) {
    throw getTransactionError(err as BaseError, {
      ...args,
      account,
      chain: client.chain,
    });
  }
}
