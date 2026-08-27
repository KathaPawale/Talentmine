import crypto from "node:crypto";
import { config } from "../config";

const KEY = Buffer.from(config.TOKEN_ENCRYPTION_KEY, "hex");

/** AES-256-GCM: returns iv.ciphertext.tag, base64url-joined with dots. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, enc, tag].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB, encB, tagB] = payload.split(".");
  if (!ivB || !encB || !tagB) throw new Error("malformed encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8");
}

export const newId = (): string => crypto.randomUUID();
