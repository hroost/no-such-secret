import { describe, expect, it } from "vitest";
import { decryptSecret } from "../../src/crypto/decrypt";
import { encryptSecret } from "../../src/crypto/encrypt";
import { parseFragment } from "../../src/crypto/fragment";
import { decodeBase64Url, encodeBase64Url } from "../../src/crypto/base64url";

describe("secret cryptography", () => {
  it("round-trips Unicode text and keeps the AES key out of the upload", async () => {
    const bytes = new TextEncoder().encode("correct horse battery staple 🔐");
    const encrypted = await encryptSecret({ kind: "text" }, bytes);
    const fragment = parseFragment(encrypted.fragment);
    expect(JSON.stringify(encrypted.upload)).not.toContain(encodeBase64Url(fragment.key));
    const result = await decryptSecret(fragment.key, encrypted.upload.nonce, decodeBase64Url(encrypted.upload.ciphertext));
    expect(new TextDecoder().decode(result.content)).toBe("correct horse battery staple 🔐");
    expect(result.metadata).toEqual({ kind: "text" });
  });

  it("round-trips arbitrary file bytes and filenames", async () => {
    const bytes = Uint8Array.from([0, 255, 4, 127, 0, 42]);
    const encrypted = await encryptSecret({ kind: "file", filename: "rätsel.bin", mimeType: "application/octet-stream" }, bytes);
    const fragment = parseFragment(encrypted.fragment);
    const result = await decryptSecret(fragment.key, encrypted.upload.nonce, decodeBase64Url(encrypted.upload.ciphertext));
    expect([...result.content]).toEqual([...bytes]);
    expect(result.metadata).toEqual({ kind: "file", filename: "rätsel.bin", mimeType: "application/octet-stream" });
  });

  it("uses fresh capabilities and rejects altered ciphertext", async () => {
    const first = await encryptSecret({ kind: "text" }, new TextEncoder().encode("one"));
    const second = await encryptSecret({ kind: "text" }, new TextEncoder().encode("one"));
    expect(first.fragment).not.toEqual(second.fragment);
    const fragment = parseFragment(first.fragment); const altered = decodeBase64Url(first.upload.ciphertext); altered[0] = altered[0]! ^ 1;
    await expect(decryptSecret(fragment.key, first.upload.nonce, altered)).rejects.toThrow("Unable to decrypt");
  });

  it("rejects padded, invalid, and over-specified fragments", () => {
    expect(() => parseFragment("v2.a.b")).toThrow();
    expect(() => parseFragment("v1.bad=.claim")).toThrow();
    expect(() => parseFragment("v1.a.b.extra")).toThrow();
  });

  it("rejects noncanonical base64url encodings", () => {
    expect(decodeBase64Url("AA")).toEqual(new Uint8Array([0]));
    expect(() => decodeBase64Url("AB")).toThrow("Noncanonical");
  });
});
