import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import colors from "colors/safe";
import {
  type Address,
  type Hex,
  concatHex,
  decodeEventLog,
  decodeFunctionData,
  isAddress,
  parseAbi,
  slice,
} from "viem";
import type { RpcCallTrace, RpcLogTrace } from "./actions/traceCall";

// The requested module 'colors/safe.js' is a CommonJS module, which may not support all module.exports as named exports.
// CommonJS modules can always be imported via the default export, for example using:
const { bold, cyan, grey, red, white, yellow, green, dim, magenta } = colors;

export interface TraceFormatConfig {
  /**
   * Whether to trace gas with each call. Defaults to `false`.
   */
  gas?: boolean;
  /**
   * Whether to trace raw step with each call. Defaults to `false`.
   */
  raw?: boolean;
}

export interface SignaturesCache {
  events: Record<Hex, string>;
  functions: Record<Hex, string>;
}

export const getSignaturesCachePath = () => join(homedir(), ".foundry", "cache", "signatures");

export const loadSignaturesCache = (): SignaturesCache => {
  try {
    return JSON.parse(readFileSync(getSignaturesCachePath(), { encoding: "utf8" }));
  } catch {}

  return { events: {}, functions: {} };
};

export const getSelector = (input: Hex) => slice(input, 0, 4);

export const getCallTraceUnknownFunctionSelectors = (trace: RpcCallTrace, signatures: SignaturesCache): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownFunctionSelectors(subtrace, signatures))
    .filter(Boolean);

  if (trace.input) {
    const inputSelector = getSelector(trace.input);

    if (!signatures.functions[inputSelector]) rest.push(inputSelector);
  }

  return rest.join(",");
};

export const getCallTraceUnknownEventSelectors = (trace: RpcCallTrace, signatures: SignaturesCache): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownEventSelectors(subtrace, signatures))
    .filter(Boolean);

  if (trace.logs) {
    for (const log of trace.logs) {
      const selector = log.topics[0]!;

      if (!signatures.events[selector]) rest.push(selector);
    }
  }

  return rest.join(",");
};

export const getIndentLevel = (level: number, index = false) =>
  `${"  ".repeat(level - 1)}${index ? cyan(`${level - 1} ↳ `) : "    "}`;

export const formatAddress = (address: Address) => `${address.slice(0, 8)}…${address.slice(0, 4)}`;

export const formatArg = (arg: unknown, level: number): string => {
  if (Array.isArray(arg)) {
    const formattedArr = arg.map((arg) => `\n${getIndentLevel(level + 1)}${grey(formatArg(arg, level + 1))},`).join("");

    return `[${formattedArr ? `${formattedArr}\n` : ""}${getIndentLevel(level)}]`;
  }

  switch (typeof arg) {
    case "object": {
      if (arg == null) return "";

      const formattedObj = Object.entries(arg)
        .map(([key, value]) => `\n${getIndentLevel(level + 1)}${key}: ${grey(formatArg(value, level + 1))},`)
        .join("");

      return `{${formattedObj ? `${formattedObj}\n` : ""}${getIndentLevel(level)}}`;
    }
    case "string":
      return grey(isAddress(arg, { strict: false }) ? formatAddress(arg) : arg);
    default:
      return grey(String(arg));
  }
};

export const formatCallSignature = (
  trace: RpcCallTrace,
  config: Partial<TraceFormatConfig>,
  level: number,
  signatures: SignaturesCache,
) => {
  const selector = getSelector(trace.input);

  const signature = signatures.functions[selector];
  if (!signature) return trace.input;

  const { functionName, args } = decodeFunctionData({
    abi: parseAbi(
      // @ts-ignore
      [`function ${signature}`],
    ),
    data: trace.input,
  });

  const formattedArgs = args?.map((arg) => formatArg(arg, level)).join(", ");

  return `${bold((trace.revertReason || trace.error ? red : green)(functionName))}${trace.value !== "0x0" ? grey(`{ ${white(Number(trace.value).toLocaleString())} }`) : ""}${config.gas ? grey(`[ ${dim(magenta(Number(trace.gasUsed).toLocaleString()))} / ${dim(magenta(Number(trace.gas).toLocaleString()))} ]`) : ""}(${formattedArgs ?? ""})`;
};

export const formatCallLog = (log: RpcLogTrace, level: number, signatures: SignaturesCache) => {
  const selector = log.topics[0]!;

  const signature = signatures.events[selector];
  if (!signature) return concatHex(log.topics);

  const { eventName, args } = decodeEventLog({
    abi: parseAbi(
      // @ts-ignore
      [`event ${signature}`],
    ),
    data: concatHex(log.topics.slice(1).concat(log.data)),
    topics: log.topics,
    strict: false,
  });

  const formattedArgs = args?.map((arg) => formatArg(arg, level)).join(", ");

  return `${getIndentLevel(level + 1, true)}${yellow("LOG")} ${eventName}(${formattedArgs ?? ""})`;
};

export const formatCallTrace = (
  trace: RpcCallTrace,
  config: Partial<TraceFormatConfig> = {},
  signatures: SignaturesCache = loadSignaturesCache(),
  level = 1,
): string => {
  const rest = (trace.calls ?? [])
    .map((subtrace) => formatCallTrace(subtrace, config, signatures, level + 1))
    .join("\n");

  const error = trace.revertReason || trace.error;
  const returnValue = error || trace.output;
  const indentLevel = getIndentLevel(level, true);

  return `${level === 1 ? `${indentLevel}${cyan("FROM")} ${grey(trace.from)}\n` : ""}${indentLevel}${yellow(trace.type)} ${trace.from === trace.to ? grey("self") : `(${white(trace.to)})`}.${formatCallSignature(trace, config, level, signatures)}${returnValue ? (error ? red : grey)(` -> ${returnValue}`) : ""}${trace.logs ? `\n${trace.logs.map((log) => formatCallLog(log, level, signatures))}` : ""}
${config.raw ? `${grey(JSON.stringify(trace))}\n` : ""}${rest}`;
};

export async function formatFullTrace(
  trace: RpcCallTrace,
  config?: Partial<TraceFormatConfig>,
  signatures: SignaturesCache = loadSignaturesCache(),
) {
  const unknownFunctionSelectors = getCallTraceUnknownFunctionSelectors(trace, signatures);
  const unknownEventSelectors = getCallTraceUnknownEventSelectors(trace, signatures);

  if (unknownFunctionSelectors || unknownEventSelectors) {
    const searchParams = new URLSearchParams({ filter: "false" });
    if (unknownFunctionSelectors) searchParams.append("function", unknownFunctionSelectors);
    if (unknownEventSelectors) searchParams.append("event", unknownEventSelectors);

    const lookupRes = await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?${searchParams.toString()}`);
    const lookup = await lookupRes.json();

    if (lookup.ok) {
      Object.entries<{ name: string; filtered: boolean }[]>(lookup.result.function).map(([sig, results]) => {
        const match = results.find(({ filtered }) => !filtered)?.name;
        if (!match) return;

        signatures.functions[sig as Hex] = match;
      });
      Object.entries<{ name: string; filtered: boolean }[]>(lookup.result.event).map(([sig, results]) => {
        const match = results.find(({ filtered }) => !filtered)?.name;
        if (!match) return;

        signatures.events[sig as Hex] = match;
      });

      const path = getSignaturesCachePath();
      if (!existsSync(path)) mkdirSync(dirname(path), { recursive: true });

      writeFileSync(path, JSON.stringify(signatures));
    } else {
      console.warn(
        `Failed to fetch signatures for unknown selectors: ${unknownFunctionSelectors},${unknownEventSelectors}`,
        lookup.error,
        "\n",
      );
    }
  }

  return white(formatCallTrace(trace, config, signatures));
}
