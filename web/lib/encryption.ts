import crypto from "crypto";
import { env } from "./env";
const RAW_KEY = env.GOOGLE_TOKEN_ENCRYPTION_KEY;

function getKey(): Buffer {
  if (!RAW_KEY) {
    throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  }
  return crypto.createHash("sha256").update(RAW_KEY, "utf8").digest();
}

export function encryptToken(value: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
