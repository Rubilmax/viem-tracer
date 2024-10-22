import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import colors from "colors/safe.js";
import { type Address, type Hex, decodeFunctionData, isAddress, parseAbi, slice } from "viem";
import type { RpcCallTrace } from "./actions/traceCall.js";

// The requested module 'colors/safe.js' is a CommonJS module, which may not support all module.exports as named exports.
// CommonJS modules can always be imported via the default export, for example using:
const { bold, cyan, grey, red, white, yellow } = colors;

export const signaturesPath = join(homedir(), ".foundry", "cache", "signatures");

export const signatures: {
  events: Record<Hex, string>;
  functions: Record<Hex, string>;
} = existsSync(signaturesPath)
  ? JSON.parse(readFileSync(signaturesPath, { encoding: "utf8" }))
  : { events: {}, functions: {} };

export const getSelector = (input: Hex) => slice(input, 0, 4);

export const getCallTraceUnknownSelectors = (trace: RpcCallTrace): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownSelectors(subtrace))
    .filter(Boolean)
    .join(",");

  if (!trace.input) return rest;

  const selector = getSelector(trace.input);

  if (signatures.functions[selector]) return rest;

  if (!rest) return selector;

  return `${selector},${rest}`;
};

export const getIndentLevel = (level: number, index = false) =>
  `${"  ".repeat(level - 1)}${index ? cyan(`${level - 1} ↳ `) : "    "}`;

export const formatAddress = (address: Address) => `${address.slice(0, 8)}…${address.slice(0, 4)}`;

export const formatArg = (arg: unknown, level: number): string => {
  if (Array.isArray(arg)) {
    const formattedArr = arg.map((arg) => `\n${getIndentLevel(level + 1)}${formatArg(arg, level + 1)},`).join("");

    return `[${formattedArr ? `${formattedArr}\n` : ""}${getIndentLevel(level)}]`;
  }

  switch (typeof arg) {
    case "object": {
      if (arg == null) return "";

      const formattedObj = Object.entries(arg)
        .map(([key, value]) => `\n${getIndentLevel(level + 1)}${key}: ${formatArg(value, level + 1)},`)
        .join("");

      return `{${formattedObj ? `${formattedObj}\n` : ""}${getIndentLevel(level)}}`;
    }
    case "string":
      return isAddress(arg, { strict: false }) ? formatAddress(arg) : arg;
    default:
      return String(arg);
  }
};

export const formatCallSignature = (trace: RpcCallTrace, level: number) => {
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

  return `${bold((trace.error ? red : yellow)(functionName))}(${grey(formattedArgs ?? "")})`;
};

export const formatCallTrace = (trace: RpcCallTrace, level = 1): string => {
  const rest = (trace.calls ?? []).map((subtrace) => formatCallTrace(subtrace, level + 1)).join("\n");

  const returnValue = trace.revertReason ?? trace.output;

  return `${level === 1 ? `${getIndentLevel(level, true)}${cyan("FROM")} ${grey(trace.from)}\n` : ""}${getIndentLevel(level, true)}${yellow(trace.type)} ${trace.from === trace.to ? grey("self") : `(${white(trace.to)})`}.${formatCallSignature(trace, level)}${returnValue ? (trace.error ? red : grey)(` -> ${returnValue}`) : ""}
${rest}`;
};

export async function formatFullTrace(trace: RpcCallTrace) {
  const unknownSelectors = getCallTraceUnknownSelectors(trace);

  if (unknownSelectors) {
    const lookupRes = await fetch(
      `https://api.openchain.xyz/signature-database/v1/lookup?filter=false&function=${unknownSelectors}`,
    );

    const lookup = await lookupRes.json();

    if (lookup.ok) {
      Object.entries<{ name: string; filtered: boolean }[]>(lookup.result.function).map(([sig, results]) => {
        const match = results.find(({ filtered }) => !filtered)?.name;
        if (!match) return;

        signatures.functions[sig as Hex] = match;
      });

      writeFile(signaturesPath, JSON.stringify(signatures)); // Non blocking.
    } else {
      console.warn(`Failed to fetch signatures for unknown selectors: ${unknownSelectors}`, lookup.error, "\n");
    }
  }

  return formatCallTrace(trace);
}
