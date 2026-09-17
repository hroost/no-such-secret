import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "../../src/crypto/base64url";
import { exposedStatus, parseUpload } from "../../worker/validation/input";
import { readJsonBody } from "../../worker/validation/body";

const upload = (ciphertextBytes: number) => ({
  schemaVersion: 1 as const,
  nonce: encodeBase64Url(new Uint8Array(12)),
  claimVerifier: encodeBase64Url(new Uint8Array(32)),
  ciphertext: encodeBase64Url(new Uint8Array(ciphertextBytes)),
});

describe("API validation", () => {
  it("hides every non-open public request state", () => {
    expect(exposedStatus("external", "request", "open")).toBe("open");
    expect(exposedStatus("external", "request", "filled")).toBe("unavailable");
    expect(exposedStatus("external", "request", "consumed")).toBe("unavailable");
    expect(exposedStatus("external", "share", "filled")).toBe("filled");
  });

  it("enforces the deployment ciphertext limit", () => {
    expect(parseUpload(upload(32), 32)).not.toBeNull();
    expect(parseUpload(upload(33), 32)).toBeNull();
  });

  it("rejects oversized streamed JSON before parsing", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "too large" }),
    });
    await expect(readJsonBody(request, 8)).resolves.toEqual({ ok: false, status: 413 });
  });

  it("rejects unsupported content types", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "{}" });
    await expect(readJsonBody(request, 100)).resolves.toEqual({ ok: false, status: 415 });
  });
});
