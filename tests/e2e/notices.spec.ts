import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";

async function noticeId(title: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from internal_notice where title = $1 and deleted_at is null", [title]);
  await pool.end();
  return rows[0].id;
}

async function writeNotice(page: Page, title: string, body: string, scope: "ALL" | "TEAM" = "ALL") {
  await page.goto("/notices/write");
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("본문 (Markdown)").fill(body);
  if (scope === "TEAM") await page.getByLabel("대상").selectOption("TEAM");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/notices\/manage\/\d+$/);
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("공지", () => {
  test("작성 → 게시 → 멤버 열람 → 읽음 현황 흐름", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await writeNotice(page, "E2E 전체 공지", "## 안내\n\n**중요** 내용");
    await expect(page.getByTestId("notice-status")).toHaveText("초안");
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("게시 중");

    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    await member.goto("/notices");
    await expect(member.getByTestId("notice-list")).toContainText("E2E 전체 공지");
    await expect(member.getByTestId("notice-list")).toContainText("안 읽음");
    await member.getByRole("link", { name: /E2E 전체 공지/ }).click();
    await expect(member.getByRole("heading", { name: "안내" })).toBeVisible();
    await member.goto("/notices?unread=1");
    await expect(member.getByTestId("notice-list")).not.toContainText("E2E 전체 공지");

    const id = await noticeId("E2E 전체 공지");
    await page.goto(`/notices/manage/${id}`);
    await expect(page.getByTestId("read-statuses").getByRole("row", { name: /MemberA.*배우.*확인/ })).toBeVisible();
    await expect(page.getByTestId("read-statuses").getByRole("row", { name: /MemberB.*무대팀.*미확인/ })).toBeVisible();
  });

  test("본문에 넣은 스크립트와 이벤트 속성은 렌더링되지 않는다 (XSS)", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await writeNotice(page, "E2E XSS 공지", '<script>window.__xss = 1</script>\n\n<img src=x onerror="window.__xss = 2">\n\n[클릭](javascript:window.__xss=3)');
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("게시 중");

    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    const id = await noticeId("E2E XSS 공지");
    await member.goto(`/notices/${id}`);
    await member.waitForTimeout(300);
    expect(await member.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(member.locator("main, body").locator("script", { hasText: "__xss" })).toHaveCount(0);
    await expect(member.locator('[onerror]')).toHaveCount(0);
    await expect(member.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test("팀 공지는 다른 팀 멤버에게 보이지 않고 직접 URL도 404이다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.leaderA);
    await writeNotice(page, "E2E 배우팀 공지", "배우팀만", "TEAM");
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("게시 중");
    const id = await noticeId("E2E 배우팀 공지");

    const same = await (await browser.newContext()).newPage();
    await loginAs(same, ACCOUNTS.memberA);
    await same.goto("/notices");
    await expect(same.getByTestId("notice-list")).toContainText("E2E 배우팀 공지");

    const other = await (await browser.newContext()).newPage();
    await loginAs(other, ACCOUNTS.memberB);
    await other.goto("/notices");
    await expect(other.getByTestId("notice-list")).not.toContainText("E2E 배우팀 공지");
    expect((await other.goto(`/notices/${id}`))?.status()).toBe(404);
  });

  test("일반 멤버는 작성·관리 화면에 접근할 수 없고, 타팀 팀장은 관리 상세가 403이다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    for (const path of ["/notices/write", "/notices/manage"]) {
      expect((await page.goto(path))?.status()).toBe(403);
    }
    const leaderA = await (await browser.newContext()).newPage();
    await loginAs(leaderA, ACCOUNTS.leaderA);
    await writeNotice(leaderA, "E2E 팀 비공개", "내용", "TEAM");
    const id = await noticeId("E2E 팀 비공개");
    const leaderB = await (await browser.newContext()).newPage();
    await loginAs(leaderB, ACCOUNTS.leaderB);
    expect((await leaderB.goto(`/notices/manage/${id}`))?.status()).toBe(403);
    expect((await leaderB.goto(`/notices/${id}/edit`))?.status()).toBe(403);
  });

  test("제목 공개 링크는 비로그인에게 제목만 보여주고 중단하면 404이다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await writeNotice(page, "E2E 공유 제목", "비밀 본문 내용");
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("게시 중");
    const id = await noticeId("E2E 공유 제목");
    await page.goto(`/notices/${id}`);
    await page.getByRole("button", { name: /제목 공개 링크 발급/ }).click();
    const link = (await page.getByTestId("share-link").textContent())!.trim();
    expect(link).toMatch(/\/share\/notices\/[A-Za-z0-9_-]{43}$/);

    const anonymous = await (await browser.newContext()).newPage();
    await anonymous.goto(link);
    await expect(anonymous.getByRole("heading", { name: "E2E 공유 제목" })).toBeVisible();
    await expect(anonymous.getByText("비밀 본문 내용")).toHaveCount(0);
    await expect(anonymous.getByRole("link", { name: "로그인하고 공지 보기" })).toBeVisible();

    await page.getByRole("button", { name: "공개 링크 중단" }).click();
    await expect(page.getByTestId("share-revoked")).toContainText("공유 링크를 중단했습니다");
    expect((await anonymous.goto(link))?.status()).toBe(404);
  });

  test("종료 후 보관 흐름과 초안 삭제", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await writeNotice(page, "E2E 상태 흐름", "내용");
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("게시 중");
    await page.getByRole("button", { name: "종료" }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("종료");
    await page.getByRole("button", { name: "보관" }).click();
    await expect(page.getByTestId("notice-status")).toHaveText("보관");

    await writeNotice(page, "E2E 삭제 대상", "내용");
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page).toHaveURL(/\/notices\/manage$/);
    await expect(page.getByTestId("manage-list")).not.toContainText("E2E 삭제 대상");
  });
});
