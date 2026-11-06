import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath (오픈 리다이렉트 방지)", () => {
  it.each(["/dashboard", "/notices?page=2", "/resources/5/edit", "/calendar#today"])(
    "같은 사이트의 상대 경로 %s는 허용한다",
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    "https://evil.example.com",
    "//evil.example.com",
    "/\\evil.example.com",
    "\\\\evil.example.com",
    "javascript:alert(1)",
    "evil.example.com",
    "/login",
    "/login?error=x",
    "/%2F%2Fevil.example.com",
    "/path\nwith-newline",
    "/path\twith-tab",
    "",
  ])("위험하거나 로그인 자신을 가리키는 값 %j는 기본 경로로 대체한다", (path) => {
    expect(safeRedirectPath(path)).toBe("/dashboard");
  });

  it("값이 없거나 문자열이 아니면 기본 경로다", () => {
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(["/a", "/b"])).toBe("/dashboard");
  });

  it("너무 긴 경로는 거부한다", () => {
    expect(safeRedirectPath("/" + "a".repeat(2100))).toBe("/dashboard");
  });
});
