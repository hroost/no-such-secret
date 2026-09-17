import { describe, expect, it } from "vitest";
import type { SecretRecord } from "../../src/shared/contracts";
import { canReveal, canSubmit, consume, fill, isExpired } from "../../worker/durable-object/state";

const openRequest = (): SecretRecord => ({ schemaVersion: 1, id: "id", mode: "request", audience: "external", state: "OPEN", createdAt: 100, expiresAt: 1000, ttlSeconds: 60 });

describe("one-time lifecycle", () => {
  it("only fills an open request and resets its post-submission expiry", () => {
    const filled = fill(openRequest(), "opaque-key", 10, "verifier", 900);
    expect(filled.state).toBe("FILLED"); expect(filled.expiresAt).toBe(60900); expect(canSubmit(filled, 901)).toBe(false);
    expect(() => fill(filled, "other", 10, "other", 902)).toThrow();
  });
  it("only consumes a live filled record once", () => {
    const filled = fill(openRequest(), "opaque-key", 10, "verifier", 200);
    expect(canReveal(filled, 201)).toBe(true);
    const consumed = consume(filled, 202);
    expect(consumed.state).toBe("CONSUMED"); expect(canReveal(consumed, 203)).toBe(false);
    expect(() => consume(consumed, 204)).toThrow();
  });
  it("treats expiry as unavailable for every transition", () => {
    const record = openRequest(); expect(isExpired(record, 1000)).toBe(true); expect(canSubmit(record, 1000)).toBe(false);
  });
});
