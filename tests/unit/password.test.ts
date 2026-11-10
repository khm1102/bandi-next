import { describe, expect, it } from "vitest";
import { hashPassword, InvalidPasswordError, validateNewPassword, verifyPassword } from "@/features/member/password";

describe("비밀번호 정책", () => {
  it("10자 이상이고 학번과 다르며 확인과 같으면 통과한다", () => {
    expect(() => validateNewPassword("2025591010", "safe-password-1", "safe-password-1")).not.toThrow();
  });
  it("10자 미만이면 거부한다", () => {
    expect(() => validateNewPassword("2025591010", "short-pw", "short-pw")).toThrow(InvalidPasswordError);
  });
  it("정확히 10자는 허용한다", () => {
    expect(() => validateNewPassword("2025591010", "abcdefghij", "abcdefghij")).not.toThrow();
  });
  it("학번과 같으면 거부한다", () => {
    expect(() => validateNewPassword("2025591010", "2025591010", "2025591010")).toThrow("학번");
  });
  it("확인이 다르면 거부한다", () => {
    expect(() => validateNewPassword("2025591010", "safe-password-1", "safe-password-2")).toThrow("확인");
  });
  it("100자를 넘기면 거부한다", () => {
    const long = "a".repeat(101);
    expect(() => validateNewPassword("2025591010", long, long)).toThrow(InvalidPasswordError);
  });
});

describe("비밀번호 해시", () => {
  it("같은 비밀번호도 매번 다른 해시가 나오고 각각 검증된다", async () => {
    const [a, b] = await Promise.all([hashPassword("safe-password-1"), hashPassword("safe-password-1")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("safe-password-1", a)).toBe(true);
    expect(await verifyPassword("safe-password-1", b)).toBe(true);
  });
  it("틀린 비밀번호는 거부한다", async () => {
    const hash = await hashPassword("safe-password-1");
    expect(await verifyPassword("safe-password-2", hash)).toBe(false);
  });
  it("저장 형식이 아니면 false이다", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
  it("원문이 해시에 그대로 들어가지 않는다", async () => {
    expect(await hashPassword("safe-password-1")).not.toContain("safe-password-1");
  });
});
