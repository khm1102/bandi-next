import { describe, expect, it } from "vitest";
import { isSameOrigin, requiresCsrfCheck } from "@/lib/csrf";
import { contentDisposition } from "@/lib/http";

const headers = (init: Record<string, string>) => new Headers(init);

describe("출처 검증 (CSRF)", () => {
  it("Origin 호스트가 요청 Host와 같으면 허용한다", () => {
    expect(isSameOrigin(headers({ host: "localhost:3100", origin: "http://localhost:3100" }))).toBe(true);
  });

  it("Origin이 다른 사이트면 거부한다", () => {
    expect(isSameOrigin(headers({ host: "localhost:3100", origin: "https://evil.example.com" }))).toBe(false);
    expect(isSameOrigin(headers({ host: "localhost:3100", origin: "http://localhost:3101" }))).toBe(false);
  });

  it("Origin이 없으면 Referer로 판단하고, 둘 다 없거나 null이면 거부한다", () => {
    expect(isSameOrigin(headers({ host: "a.test", referer: "https://a.test/page" }))).toBe(true);
    expect(isSameOrigin(headers({ host: "a.test", referer: "https://b.test/page" }))).toBe(false);
    expect(isSameOrigin(headers({ host: "a.test" }))).toBe(false);
    expect(isSameOrigin(headers({ host: "a.test", origin: "null" }))).toBe(false);
    expect(isSameOrigin(headers({ origin: "https://a.test" }))).toBe(false);
  });

  it("GET/HEAD/OPTIONS 이외의 메서드만 검사 대상이다", () => {
    expect(requiresCsrfCheck("GET")).toBe(false);
    expect(requiresCsrfCheck("post")).toBe(true);
    expect(requiresCsrfCheck("DELETE")).toBe(true);
  });
});

describe("Content-Disposition", () => {
  it("한글 파일명을 RFC 5987로 인코딩하고 ASCII 대체 이름을 둔다", () => {
    const value = contentDisposition("attachment", "활동 내역서.hwpx");
    expect(value).toContain("attachment;");
    expect(value).toContain("filename*=UTF-8''%ED%99%9C%EB%8F%99%20%EB%82%B4%EC%97%AD%EC%84%9C.hwpx");
    expect(value).toMatch(/filename="[\x20-\x7e]+"/);
  });

  it("따옴표·역슬래시·개행으로 헤더를 깨뜨릴 수 없다", () => {
    const value = contentDisposition("attachment", 'a"b\\c\r\nSet-Cookie: x=1.png');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value.split('"').length).toBe(3);
  });
});
