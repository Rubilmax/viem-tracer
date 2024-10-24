import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import colors from "colors/safe.js";
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
import type { RpcCallTrace, RpcLogTrace } from "./actions/traceCall.js";

// The requested module 'colors/safe.js' is a CommonJS module, which may not support all module.exports as named exports.
// CommonJS modules can always be imported via the default export, for example using:
const { bold, cyan, grey, red, white, yellow, green, dim, magenta } = colors;

export type TraceFormatConfig = {
  gas: boolean;
};

export const signaturesPath = join(homedir(), ".foundry", "cache", "signatures");

export const signatures: {
  events: Record<Hex, string>;
  functions: Record<Hex, string>;
} = existsSync(signaturesPath)
  ? JSON.parse(readFileSync(signaturesPath, { encoding: "utf8" }))
  : { events: {}, functions: {} };

export const getSelector = (input: Hex) => slice(input, 0, 4);

export const getCallTraceUnknownFunctionSelectors = (trace: RpcCallTrace): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownFunctionSelectors(subtrace))
    .filter(Boolean);

  if (trace.input) {
    const inputSelector = getSelector(trace.input);

    if (!signatures.functions[inputSelector]) rest.push(inputSelector);
  }

  return rest.join(",");
};

export const getCallTraceUnknownEventSelectors = (trace: RpcCallTrace): string => {
  const rest = (trace.calls ?? []).flatMap((subtrace) => getCallTraceUnknownEventSelectors(subtrace)).filter(Boolean);

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

export const formatCallSignature = (trace: RpcCallTrace, config: Partial<TraceFormatConfig>, level: number) => {
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

  return `${bold((trace.error ? red : green)(functionName))}${config.gas ? dim(magenta(`{ ${Number(trace.gasUsed).toLocaleString()} / ${Number(trace.gas).toLocaleString()} }`)) : ""}(${formattedArgs ?? ""})`;
};

export const formatCallLog = (log: RpcLogTrace, level: number) => {
  const selector = log.topics[0]!;

  const signature = signatures.events[selector];
  if (!signature) return concatHex(log.topics);

  const nbIndexed = log.topics.length - 1;

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

export const formatCallTrace = (trace: RpcCallTrace, config: Partial<TraceFormatConfig> = {}, level = 1): string => {
  const rest = (trace.calls ?? []).map((subtrace) => formatCallTrace(subtrace, config, level + 1)).join("\n");

  const returnValue = trace.revertReason ?? trace.output;

  return `${level === 1 ? `${getIndentLevel(level, true)}${cyan("FROM")} ${grey(trace.from)}\n` : ""}${getIndentLevel(level, true)}${yellow(trace.type)} ${trace.from === trace.to ? grey("self") : `(${white(trace.to)})`}.${formatCallSignature(trace, config, level)}${returnValue ? (trace.error ? red : grey)(` -> ${returnValue}`) : ""}${trace.logs ? `\n${trace.logs.map((log) => formatCallLog(log, level))}` : ""}
${rest}`;
};

export async function formatFullTrace(trace: RpcCallTrace, config?: Partial<TraceFormatConfig>) {
  const unknownFunctionSelectors = getCallTraceUnknownFunctionSelectors(trace);
  const unknownEventSelectors = getCallTraceUnknownEventSelectors(trace);

  if (unknownFunctionSelectors || unknownEventSelectors) {
    const lookupRes = await fetch(
      `https://api.openchain.xyz/signature-database/v1/lookup?filter=false${unknownFunctionSelectors ? `&function=${unknownFunctionSelectors}` : ""}${unknownEventSelectors ? `&event=${unknownEventSelectors}` : ""}`,
    );

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

      writeFile(signaturesPath, JSON.stringify(signatures)); // Non blocking.
    } else {
      console.warn(
        `Failed to fetch signatures for unknown selectors: ${unknownFunctionSelectors},${unknownEventSelectors}`,
        lookup.error,
        "\n",
      );
    }
  }

  return white(formatCallTrace(trace, config));
}
