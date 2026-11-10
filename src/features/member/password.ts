import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** 반디 비밀번호 정책: 10자 이상, 학번과 같으면 불가. 길이 중심 정책이라 복잡도 규칙은 두지 않는다. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 100;

export class InvalidPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPasswordError";
  }
}

export function validateNewPassword(studentNo: string, password: string, confirm: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new InvalidPasswordError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new InvalidPasswordError(`비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하로 정해 주세요.`);
  }
  if (password === studentNo) {
    throw new InvalidPasswordError("학번과 같은 비밀번호는 사용할 수 없어요.");
  }
  if (password !== confirm) {
    throw new InvalidPasswordError("비밀번호 확인이 일치하지 않아요.");
  }
}

// scrypt 비용: N=2^15, r=8, p=1 (메모리 약 32MiB). 형식: scrypt$N$r$p$salt$hash (base64url)
const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r + 1024 * 1024 };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** 저장 형식이 아니면 false. 비교는 상수 시간으로 한다. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | null = null;
/** 계정이 없거나 비밀번호가 미설정인 경우에도 같은 비용의 검증을 수행해 응답 시간으로 존재 여부가 드러나지 않게 한다. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummy);
  return false;
}
