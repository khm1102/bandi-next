import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("보안 헤더와 CSP", () => {
  test("모든 응답에 보안 헤더와 nonce 기반 CSP가 붙는다", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    const csp = headers["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    const another = (await request.get("/login")).headers()["content-security-policy"];
    expect(another).not.toBe(csp); // 요청마다 nonce가 다르다
  });

  test("인증 API 거부 응답에도 CSP가 붙는다", async ({ request }) => {
    const response = await request.get("/api/members/me/profile-photo");
    expect(response.headers()["content-security-policy"]).toBeTruthy();
  });

  test("주요 화면에서 CSP 위반(차단된 스크립트·스타일)이 발생하지 않는다", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|violates the following/i.test(message.text())) violations.push(message.text());
    });
    await loginAs(page, ACCOUNTS.admin);
    for (const path of ["/dashboard", "/calendar", "/notices", "/notices/write", "/resources", "/resources/write", "/activity", "/activity-documents", "/props", "/members", "/profile"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });

  test("페이지의 인라인 스크립트에는 nonce가 있다", async ({ page }) => {
    await page.goto("/login");
    // 내용이 있는(실행되는) 인라인 스크립트만 대상으로 한다.
    const scripts = await page
      .locator("script:not([src])")
      .evaluateAll((nodes) => nodes.filter((n) => (n.textContent ?? "").trim() !== "").map((n) => (n as HTMLScriptElement).nonce));
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.every((nonce) => nonce && nonce.length > 10)).toBe(true);
  });
});
