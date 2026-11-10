import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, loginAs, newSession, resetSeed } from "./support";

async function adminPage(page: Page) {
  await loginAs(page, ACCOUNTS.admin);
}

/** 반디 비밀번호 로그인 시도 (실패 문구 확인용). */
async function tryLogin(page: Page, studentNo: string, password: string) {
  await page.getByLabel("학번", { exact: true }).fill(studentNo);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await posted;
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("운영 관리 — 권한", () => {
  test("운영진에게만 메뉴가 보이고, 팀장·멤버는 화면과 내보내기 API가 모두 거부된다", async ({ page, browser }) => {
    await adminPage(page);
    await expect(page.getByRole("link", { name: "운영 관리" })).toBeVisible();
    for (const account of [ACCOUNTS.memberA, ACCOUNTS.leaderA]) {
      const other = await newSession(browser, account);
      await expect(other.getByRole("link", { name: "운영 관리" })).toHaveCount(0);
      expect((await other.goto("/admin"))?.status()).toBe(403);
      expect((await other.context().request.get("/api/admin/export/members")).status()).toBe(403);
      expect((await other.context().request.get("/api/admin/export/notice-reads?noticeId=1")).status()).toBe(403);
      await other.context().close();
    }
  });
});

test.describe("운영 관리 — 통계", () => {
  test("활동 중 멤버 수와 팀별 인원, 월별 표 보기를 보여준다", async ({ page }) => {
    await adminPage(page);
    await page.goto("/admin");
    await expect(page.getByTestId("stat-active-members")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("team-members-chart")).toContainText("배우");
    await page.getByText("표로 보기").click();
    await expect(page.getByTestId("monthly-table").locator("tbody tr")).toHaveCount(6);
  });
});

test.describe("운영 관리 — 화면 설정", () => {
  test("저장하기 전에 미리보기가 바로 바뀌고, 역할별로 보이는 메뉴를 확인하며, 변경 취소로 되돌릴 수 있다", async ({ page }) => {
    await adminPage(page);
    await page.goto("/admin/settings");
    const home = page.getByTestId("home-preview");
    const nav = page.getByTestId("nav-preview");
    const cards = () => home.locator("[data-preview-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-preview-card")));
    const menus = () => nav.locator("[data-preview-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-preview-nav")));
    await expect(home).toContainText("저장된 상태");
    expect(await cards()).toEqual(["schedule", "notices", "quick"]);

    await page.getByRole("button", { name: "중요·미확인 공지 위로" }).click();
    await page.getByLabel("요약 통계 (오늘 일정·미확인 공지·주의 자산)").uncheck();
    await expect(home).toContainText("저장 전 변경 있음");
    expect(await cards()).toEqual(["notices", "schedule", "quick"]);
    await expect(home.locator('[data-preview-block="stats"]')).toHaveCount(0);

    // 역할별 미리보기: 일반 부원에게는 운영 전용 메뉴가 보이지 않는다.
    await page.getByRole("button", { name: "일반 부원으로 보기" }).click();
    expect(await menus()).not.toContain("members");
    expect(await menus()).not.toContain("admin");
    await page.getByRole("button", { name: "운영진으로 보기" }).click();
    expect(await menus()).toContain("admin");
    await page.getByLabel("자료실 메뉴 표시").uncheck();
    expect(await menus()).not.toContain("resources");

    // 저장하지 않고 취소하면 원래대로 돌아가고, 실제 설정은 바뀌지 않았다.
    await page.getByRole("button", { name: "변경 취소" }).first().click();
    expect(await cards()).toEqual(["schedule", "notices", "quick"]);
    await expect(home).toContainText("저장된 상태");
    await page.getByRole("button", { name: "변경 취소" }).last().click();
    expect(await menus()).toContain("resources");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "자료실", exact: true })).toBeVisible();
  });

  test("메뉴를 숨기고 홈 카드 순서를 바꾸면 모든 멤버 화면에 반영되고, 기본값으로 되돌릴 수 있다 (권한은 그대로)", async ({ page, browser }) => {
    await adminPage(page);
    await page.goto("/admin/settings");
    await page.getByLabel("자료실 메뉴 표시").uncheck();
    await page.getByRole("button", { name: "메뉴 설정 저장" }).click();
    await expect(page.getByText("메뉴 설정을 저장했습니다.")).toBeVisible();
    await page.getByRole("button", { name: "중요·미확인 공지 위로" }).click();
    await page.getByLabel("빠른 이동 표시").uncheck();
    await page.getByRole("button", { name: "홈 화면 설정 저장" }).click();
    await expect(page.getByText("홈 화면 설정을 저장했습니다.")).toBeVisible();

    const member = await newSession(browser, ACCOUNTS.memberA);
    await expect(member.getByRole("link", { name: "자료실", exact: true })).toHaveCount(0);
    await expect(member.getByRole("heading", { name: "빠른 이동" })).toHaveCount(0);
    const cardTitles = await member.locator("main section h2").allInnerTexts();
    expect(cardTitles.indexOf("중요·미확인 공지")).toBeLessThan(cardTitles.indexOf("오늘의 일정"));
    // 메뉴를 숨겨도 권한은 그대로라 주소로는 열린다.
    expect((await member.goto("/resources"))?.status()).toBe(200);

    await page.goto("/admin/settings");
    const resets = page.getByRole("button", { name: "기본값으로 되돌리기" });
    await resets.nth(0).click();
    await expect(page.getByText("기본값으로 되돌렸습니다.").first()).toBeVisible();
    await resets.nth(1).click();
    await expect(page.getByText("기본값으로 되돌렸습니다.")).toHaveCount(2);
    // 되돌린 뒤 편집 화면도 기본값을 보여준다.
    await expect(page.getByLabel("자료실 메뉴 표시")).toBeChecked();
    await expect(page.getByLabel("빠른 이동 표시")).toBeChecked();
    await member.goto("/dashboard");
    await expect(member.getByRole("link", { name: "자료실", exact: true })).toBeVisible();
    await expect(member.getByRole("heading", { name: "빠른 이동" })).toBeVisible();

    await page.goto("/admin/audit?action=SETTINGS_CHANGED");
    await expect(page.getByTestId("audit-list")).toContainText("메뉴 설정을 변경");
    await member.context().close();
  });
});

test.describe("운영 관리 — 계정 운영", () => {
  test("5번 실패로 잠긴 계정을 운영진이 풀면 바로 로그인할 수 있다", async ({ page, browser }) => {
    const victim = await (await browser.newContext({ locale: "ko-KR" })).newPage();
    await victim.goto("/login");
    for (let i = 0; i < 5; i++) await tryLogin(victim, ACCOUNTS.leaderB, "wrong-password");
    await expect(victim.locator("#authError")).toContainText("15분");

    await adminPage(page);
    await page.goto("/admin/accounts?filter=locked");
    const row = page.getByTestId("account-list").getByRole("listitem").filter({ hasText: "LeaderB" });
    await expect(row).toContainText("잠김");
    await row.getByRole("button", { name: "잠금 해제" }).click();
    await expect(page.getByTestId("account-list")).toHaveCount(0);

    await tryLogin(victim, ACCOUNTS.leaderB, "pw");
    await expect(victim).toHaveURL(/\/dashboard$/);
    await victim.context().close();
  });

  test("비밀번호 재설정을 요구하면 기존 세션이 끊기고 예전 비밀번호로는 로그인할 수 없다", async ({ page, browser }) => {
    const victim = await newSession(browser, ACCOUNTS.memberB);
    await adminPage(page);
    await page.goto("/admin/accounts?q=MemberB");
    const row = page.getByTestId("account-list").getByRole("listitem").filter({ hasText: "MemberB" });
    await row.getByRole("button", { name: "비밀번호 재설정 요구" }).click();
    const dialog = page.getByRole("dialog", { name: "비밀번호 재설정 요구" });
    await dialog.getByLabel("사유").fill("비밀번호 유출 의심");
    await dialog.getByRole("button", { name: "재설정 요구" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("account-list")).toContainText("비밀번호 미설정");

    await victim.goto("/dashboard");
    await expect(victim).toHaveURL(/\/login/);
    await tryLogin(victim, ACCOUNTS.memberB, "pw");
    await expect(victim.locator("#authError")).toContainText("학번 또는 비밀번호를 다시 확인해 주세요");

    await page.goto("/admin/audit?action=MEMBER_PASSWORD_RESET");
    await expect(page.getByTestId("audit-list")).toContainText("비밀번호 유출 의심");
    await victim.context().close();
  });

  test("본인 계정에는 비밀번호 재설정 요구 버튼이 없다", async ({ page }) => {
    await adminPage(page);
    await page.goto("/admin/accounts?q=AdminX");
    const row = page.getByTestId("account-list").getByRole("listitem").filter({ hasText: "AdminX" });
    await expect(row.getByRole("button", { name: "비밀번호 재설정 요구" })).toHaveCount(0);
  });
});

test.describe("운영 관리 — 내보내기", () => {
  test("멤버 명단 CSV는 BOM·머리글을 갖추고, 내보낸 기록이 감사 로그에 남는다", async ({ page }) => {
    await adminPage(page);
    const response = await page.context().request.get("/api/admin/export/members");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain('"학번","이름","팀","기수","역할"');
    expect(body).toContain("MemberA");

    await page.goto("/admin/audit?action=DATA_EXPORTED");
    await expect(page.getByTestId("audit-list")).toContainText("멤버 명단 CSV 내보내기");
  });
});
