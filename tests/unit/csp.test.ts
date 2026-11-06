import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "@/lib/csp";

describe("buildCsp", () => {
  it("스크립트는 nonce가 있는 것만 허용하고 인라인 스크립트(unsafe-inline)는 허용하지 않는다", () => {
    const csp = buildCsp("abc123", { dev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("프레임·객체·base 변경·외부 폼 전송을 금지한다", () => {
    const csp = buildCsp("n", { dev: false });
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
      expect(csp).toContain(directive);
    }
  });

  it("운영에서는 http 리소스를 https로 올리고, 개발에서만 unsafe-eval을 허용한다", () => {
    expect(buildCsp("n", { dev: false })).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", { dev: true })).not.toContain("upgrade-insecure-requests");
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });

  it("스타일은 운영에서 nonce로 제한하고 개발에서만 inline을 허용한다", () => {
    expect(buildCsp("n", { dev: false })).toMatch(/style-src 'self' 'nonce-n'/);
    expect(buildCsp("n", { dev: false })).not.toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(buildCsp("n", { dev: true })).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("nonce는 요청마다 다르고 추측하기 어려운 길이다", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
