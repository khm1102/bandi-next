import { randomBytes } from "node:crypto";

/** 256비트 난수의 Base64URL(무패딩) = 43자. 추측할 수 없는 공개 공유 토큰. */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
