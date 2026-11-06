import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://bandi:pw@localhost:5433/bandi",
  FILE_STORAGE_ROOT: "/tmp/files",
  LOGIN_ATTEMPT_HASH_SECRET: "0123456789abcdef",
};

describe("parseEnv", () => {
  it("필수 값이 있으면 기본값을 채워 반환한다", () => {
    const env = parseEnv(valid);
    expect(env.SCHOOL_LOGIN_MAX_FAILURES).toBe(5);
    expect(env.SCHOOL_LOGIN_FAILURE_WINDOW_MINUTES).toBe(15);
    expect(env.SESSION_TTL_MINUTES).toBe(30);
  });

  it("DATABASE_URL이 없으면 필드명만 담긴 예외가 발생한다", () => {
    const missing: Record<string, string | undefined> = { ...valid, DATABASE_URL: undefined };
    expect(() => parseEnv(missing)).toThrow(/DATABASE_URL/);
  });

  it("예외 메시지에 비밀값 원문이 노출되지 않는다", () => {
    try {
      parseEnv({ ...valid, LOGIN_ATTEMPT_HASH_SECRET: "short-secret" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("short-secret");
    }
  });

  it("운영 환경에서 개발용 해시 비밀값 기본값은 거부한다", () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        LOGIN_ATTEMPT_HASH_SECRET: "local-development-only-secret",
      }),
    ).toThrow(/LOGIN_ATTEMPT_HASH_SECRET/);
  });

  it("실패 제한 설정이 0 이하이면 거부한다", () => {
    expect(() => parseEnv({ ...valid, SCHOOL_LOGIN_MAX_FAILURES: "0" })).toThrow(
      /SCHOOL_LOGIN_MAX_FAILURES/,
    );
  });
});
