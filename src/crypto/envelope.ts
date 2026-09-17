import type { EncryptedMetadata } from "../shared/contracts";

const MAGIC = new Uint8Array([0x4e, 0x53, 0x53, 0x01]); // NSS v1
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function validMetadata(value: unknown): value is EncryptedMetadata {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return input.kind === "text" || (input.kind === "file" && typeof input.filename === "string" && typeof input.mimeType === "string");
}

export function makeEnvelope(metadata: EncryptedMetadata, content: Uint8Array): Uint8Array {
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  if (metadataBytes.byteLength > 4096) throw new Error("Metadata is too large");
  const result = new Uint8Array(MAGIC.byteLength + 4 + metadataBytes.byteLength + content.byteLength);
  result.set(MAGIC);
  new DataView(result.buffer).setUint32(MAGIC.byteLength, metadataBytes.byteLength, false);
  result.set(metadataBytes, MAGIC.byteLength + 4);
  result.set(content, MAGIC.byteLength + 4 + metadataBytes.byteLength);
  return result;
}

export function readEnvelope(envelope: Uint8Array): { metadata: EncryptedMetadata; content: Uint8Array } {
  if (envelope.byteLength < 8 || !MAGIC.every((byte, index) => envelope[index] === byte)) throw new Error("Invalid encrypted envelope");
  const metadataLength = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength).getUint32(4, false);
  const contentOffset = 8 + metadataLength;
  if (metadataLength > 4096 || contentOffset > envelope.byteLength) throw new Error("Invalid encrypted envelope");
  let metadata: unknown;
  try { metadata = JSON.parse(decoder.decode(envelope.slice(8, contentOffset))); } catch { throw new Error("Invalid encrypted envelope"); }
  if (!validMetadata(metadata)) throw new Error("Invalid encrypted envelope");
  return { metadata, content: envelope.slice(contentOffset) };
}
