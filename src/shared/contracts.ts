export type Audience = "internal" | "external";
export type Mode = "share" | "request";
export type SecretState = "OPEN" | "UPLOADING" | "FILLED" | "CONSUMED";

export type SecretRecord = {
  schemaVersion: 1;
  id: string;
  mode: Mode;
  audience: Audience;
  state: SecretState;
  createdAt: number;
  filledAt?: number;
  consumedAt?: number;
  expiresAt: number;
  ttlSeconds: number;
  createdBy?: string;
  payloadObjectKey?: string;
  encryptedByteLength?: number;
  claimVerifier?: string;
};

export type UploadManifest = {
  schemaVersion: 1;
  nonce: string;
  claimVerifier: string;
  ciphertext: string;
};

export type CreateRequest = { audience: Audience; ttlSeconds: number };
export type CreateShare = CreateRequest & UploadManifest;

export type EncryptedMetadata =
  | { kind: "text" }
  | { kind: "file"; filename: string; mimeType: string };
