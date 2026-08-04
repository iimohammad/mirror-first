import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// رمز عبور نکسس داخل سشن ذخیره می‌شود (چون REST API نکسس Basic Auth
// می‌خواهد، نه توکن) و باید at-rest رمزنگاری شود، نه فقط base64.
function getKey(): Buffer {
  const hex = process.env.PANEL_SESSION_SECRET;
  if (!hex) {
    throw new Error(
      "PANEL_SESSION_SECRET تنظیم نشده — با `openssl rand -hex 32` بسازش و در .env بگذار."
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("PANEL_SESSION_SECRET باید ۳۲ بایت (۶۴ کاراکتر hex) باشد.");
  }
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
