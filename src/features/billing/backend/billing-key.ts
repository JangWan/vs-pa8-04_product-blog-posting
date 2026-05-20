// AES-256-GCM 암호화/복호화 — Toss 빌링키 서버 보관 (BR-35)
// BILLING_KEY_ENCRYPTION_SECRET 환경변수: 32자 이상 랜덤 문자열

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.BILLING_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BILLING_KEY_ENCRYPTION_SECRET must be at least 32 characters");
  }
  const encoder = new TextEncoder();
  const raw = encoder.encode(secret).slice(0, 32); // 32바이트(256비트)

  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBillingKey(billingKey: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(billingKey);

  const cipherBuffer = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), IV_LENGTH);

  return Buffer.from(combined).toString("base64");
}

export async function decryptBillingKey(encrypted: string): Promise<string> {
  const key = await importKey();
  const combined = Buffer.from(encrypted, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );
  return new TextDecoder().decode(plainBuffer);
}
