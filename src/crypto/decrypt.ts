import { asArrayBuffer, decodeBase64Url } from "./base64url";
import { readEnvelope } from "./envelope";
import type { EncryptedMetadata } from "../shared/contracts";

const AAD = new TextEncoder().encode("secure-share:v1");

export async function decryptSecret(keyBytes: Uint8Array, nonce: string, ciphertext: Uint8Array): Promise<{ metadata: EncryptedMetadata; content: Uint8Array }> {
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  try {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(decodeBase64Url(nonce, 12)), additionalData: asArrayBuffer(AAD), tagLength: 128 }, key, asArrayBuffer(ciphertext)));
    return readEnvelope(plaintext);
  } catch { throw new Error("Unable to decrypt this secret"); }
}
