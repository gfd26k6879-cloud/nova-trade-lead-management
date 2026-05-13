import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export function encryptSecret(plaintext: string): string {
  const value = plaintext.trim();
  if (!value) throw new Error("Secret value is empty.");

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(encrypted: string): string {
  const [version, ivRaw, authTagRaw, ciphertextRaw] = encrypted.split(".");
  if (version !== VERSION || !ivRaw || !authTagRaw || !ciphertextRaw) {
    throw new Error("Encrypted secret format is invalid.");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function getEncryptionKey(): Buffer {
  const secret = process.env.NOSITE_ENCRYPTION_SECRET ?? process.env.NOSITE_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("NOSITE_ENCRYPTION_SECRET is required to encrypt API keys.");
  }
  return createHash("sha256").update(secret).digest();
}
