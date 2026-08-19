import { describe, expect, test } from "vitest";
import type { RpcCallTrace } from "../src/actions/traceCall";
import { formatCallSignature, type SignaturesCache } from "../src/format";

const signatures: SignaturesCache = { events: {}, functions: {} };
const baseTrace = {
  from: "0x0000000000000000000000000000000000000001",
  gas: "0x5208",
  gasUsed: "0x5208",
  to: "0x0000000000000000000000000000000000000002",
  input: "0x",
  output: "0x",
  type: "CALL",
} as const;

describe("formatCallSignature", () => {
  test("formats zero-value blank calldata as fallback", () => {
    const formatted = formatCallSignature(baseTrace as RpcCallTrace, {}, 1, signatures);

    expect(formatted).toContain("fallback");
    expect(formatted).not.toContain("receive");
  });

  test("formats value-bearing blank calldata as receive", () => {
    const formatted = formatCallSignature({ ...baseTrace, value: "0x1" } as RpcCallTrace, {}, 1, signatures);

    expect(formatted).toContain("receive");
    expect(formatted).not.toContain("fallback");
  });
});
