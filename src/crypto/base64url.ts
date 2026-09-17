const alphabet = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  const pieces: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  const binary = pieces.join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string, expectedLength?: number): Uint8Array {
  if (!value || !alphabet.test(value) || value.includes("=") || value.length % 4 === 1) throw new Error("Invalid base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { throw new Error("Invalid base64url"); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (expectedLength !== undefined && bytes.byteLength !== expectedLength) throw new Error("Unexpected byte length");
  if (encodeBase64Url(bytes) !== value) throw new Error("Noncanonical base64url");
  return bytes;
}

/** Produces a detached ArrayBuffer for Web Crypto's strict BufferSource types. */
export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }
