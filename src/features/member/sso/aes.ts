import { createCipheriv, randomBytes } from "node:crypto";
import { SchoolSsoResponseChangedError } from "../errors";

const IV_LENGTH = 16;
const KEY_LENGTH = 16;

/**
 * 학교 포털 로그인 폼용 암호화: AES-128-CBC/PKCS7, 평문 "{value}|{timestampMillis}",
 * 결과는 base64url(무패딩) of (iv || ciphertext). Java AesCredentialEncryptor와 동일하다.
 */
export function encryptCredential(
  value: string,
  timestampMillis: number,
  keyHex: string,
  iv: Buffer = randomBytes(IV_LENGTH),
): string {
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new SchoolSsoResponseChangedError();
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== KEY_LENGTH || iv.length !== IV_LENGTH) {
    throw new SchoolSsoResponseChangedError();
  }
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(`${value}|${timestampMillis}`, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext]).toString("base64url");
}
