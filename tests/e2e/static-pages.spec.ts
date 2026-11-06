import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("정적 안내·PWA·홈", () => {
  test("개인정보·운영 문의 안내는 로그인 없이 볼 수 있다", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "개인정보 안내" })).toBeVisible();
    await expect(page.getByText("학교 계정 비밀번호는 반디에 저장하지 않습니다")).toBeVisible();
    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "운영 문의" })).toBeVisible();
  });

  test("온보딩 안내는 로그인한 멤버에게 5단계를 보여주고 진행 상태를 저장하지 않는다", async ({ page }) => {
    expect((await page.goto("/onboarding"))?.url()).toContain("/login");
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/onboarding");
    await expect(page.getByTestId("onboarding-steps").locator("li")).toHaveCount(5);
  });

  test("manifest와 서비스 워커는 인증 없이 제공되고 네트워크 전용이다", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const body = await manifest.json();
    expect(body).toMatchObject({ start_url: "/dashboard", display: "standalone", short_name: "반디" });
    const worker = await request.get("/service-worker.js");
    expect(worker.status()).toBe(200);
    expect(await worker.text()).not.toContain("caches.");
    expect((await request.get("/images/pwa-192.png")).status()).toBe(200);
  });

  test("홈은 오늘 일정·미확인 공지·주의 자산 요약을 보여준다", async ({ page, browser }) => {
    const admin = await (await browser.newContext()).newPage();
    await loginAs(admin, ACCOUNTS.admin);
    await admin.goto("/notices/write");
    await admin.getByLabel("제목").fill("E2E 홈 공지");
    await admin.getByLabel("본문 (Markdown)").fill("내용");
    await admin.getByRole("button", { name: "저장" }).click();
    await admin.getByRole("button", { name: "게시", exact: true }).click();
    await expect(admin.getByTestId("notice-status")).toHaveText("게시 중");

    await loginAs(page, ACCOUNTS.memberA);
    await expect(page.getByTestId("stat-unread")).toHaveText(/^1/);
    await expect(page.getByTestId("latest-notices")).toContainText("E2E 홈 공지");
    await expect(page.getByTestId("stat-today")).toBeVisible();
    await expect(page.getByTestId("stat-assets")).toBeVisible();
    await page.getByRole("link", { name: "E2E 홈 공지" }).click();
    await expect(page).toHaveURL(/\/notices\/\d+$/);
    await expect(page.getByRole("heading", { name: "E2E 홈 공지" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByTestId("stat-unread")).toHaveText(/^0/);
  });
});
