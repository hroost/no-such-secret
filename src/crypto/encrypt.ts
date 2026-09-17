import { asArrayBuffer, encodeBase64Url } from "./base64url";
import { makeEnvelope } from "./envelope";
import { createFragment } from "./fragment";
import type { EncryptedMetadata, UploadManifest } from "../shared/contracts";

const AAD = new TextEncoder().encode("secure-share:v1");

export async function encryptSecret(metadata: EncryptedMetadata, content: Uint8Array): Promise<{ upload: UploadManifest; fragment: string }> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const claimBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: asArrayBuffer(AAD), tagLength: 128 }, key, asArrayBuffer(makeEnvelope(metadata, content))));
  const verifier = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(claimBytes)));
  return {
    upload: { schemaVersion: 1, nonce: encodeBase64Url(nonce), claimVerifier: encodeBase64Url(verifier), ciphertext: encodeBase64Url(ciphertext) },
    fragment: createFragment(keyBytes, claimBytes),
  };
}
