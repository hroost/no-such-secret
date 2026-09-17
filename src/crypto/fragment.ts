import { decodeBase64Url, encodeBase64Url } from "./base64url";

export type SecretFragment = { key: Uint8Array; claim: Uint8Array };

export function createFragment(key: Uint8Array, claim: Uint8Array): string {
  if (key.byteLength !== 32 || claim.byteLength !== 32) throw new Error("Invalid capability length");
  return `v1.${encodeBase64Url(key)}.${encodeBase64Url(claim)}`;
}

export function parseFragment(fragment: string): SecretFragment {
  const parts = fragment.replace(/^#/, "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) throw new Error("Invalid secret link");
  return { key: decodeBase64Url(parts[1], 32), claim: decodeBase64Url(parts[2], 32) };
}
