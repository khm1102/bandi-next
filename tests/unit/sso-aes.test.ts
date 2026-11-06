import { describe, expect, it } from "vitest";
import { encryptCredential } from "@/features/member/sso/aes";

const KEY = "00112233445566778899aabbccddeeff";
const IV = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");

// Java AesCredentialEncryptor(AES/CBC/PKCS5Padding, base64url 무패딩, iv||ciphertext)로 생성한 기준값
describe("encryptCredential (Java 구현과 동일한 암호문)", () => {
  it("고정 key/iv/timestamp에서 Java 출력과 일치한다", () => {
    expect(encryptCredential("2025591010", 1767225600000, KEY, IV)).toBe(
      "AAECAwQFBgcICQoLDA0OD1qwqoyFKXN3z4xDEkHX4iF9rCgVJV-6xwIcN0fAZrXB",
    );
  });

  it("한글·특수문자 값도 UTF-8로 동일하게 암호화한다", () => {
    expect(encryptCredential("p@ss한글 word!", 1767225600123, KEY, IV)).toBe(
      "AAECAwQFBgcICQoLDA0OD0uHLIVXAwBlLS-VSUQrFHmh-dwMzA54e-BGz9RiOMOj",
    );
  });

  it("IV를 생략하면 매번 다른 암호문이 나온다", () => {
    const a = encryptCredential("x", 1, KEY);
    const b = encryptCredential("x", 1, KEY);
    expect(a).not.toBe(b);
  });

  it("키 길이가 16바이트가 아니면 예외가 발생한다", () => {
    expect(() => encryptCredential("x", 1, "0011", IV)).toThrow();
  });

  it("IV 길이가 16바이트가 아니면 예외가 발생한다", () => {
    expect(() => encryptCredential("x", 1, KEY, Buffer.alloc(8))).toThrow();
  });
});
