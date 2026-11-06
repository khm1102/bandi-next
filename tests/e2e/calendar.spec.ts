import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const month = today.slice(0, 7);

async function eventId(title: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from calendar_event where title = $1 and deleted_at is null", [title]);
  await pool.end();
  return rows[0].id;
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("캘린더", () => {
  test("운영진이 일정을 등록하면 멤버가 월간 목록에서 볼 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("E2E 전체 회의");
    await page.getByLabel("시작", { exact: true }).fill(`${today}T09:00`);
    await page.getByLabel("종료").fill(`${today}T10:00`);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page).toHaveURL(/\/calendar$/);

    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    await member.goto(`/calendar?month=${month}`);
    await expect(member.getByTestId("calendar-list")).toContainText("E2E 전체 회의");
    await expect(member.getByRole("link", { name: "일정 등록" })).toHaveCount(0);
    expect((await member.goto("/calendar/new"))?.status()).toBe(403);
  });

  test("종일 일정은 마지막 날을 포함해 저장되고 수정 화면에도 그대로 보인다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("E2E 종일 행사");
    await page.getByLabel("종일").check();
    await page.getByLabel("시작일").fill(today);
    await page.getByLabel("마지막 날").fill(today);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    const id = await eventId("E2E 종일 행사");
    await page.goto(`/calendar/${id}`);
    await expect(page.getByLabel("종일")).toBeChecked();
    await expect(page.getByLabel("마지막 날")).toHaveValue(today);
  });

  test("팀장은 자기 팀 일정만 관리하고 다른 팀 일정 화면은 403이다", async ({ page, browser }) => {
    const leaderB = await (await browser.newContext()).newPage();
    await loginAs(leaderB, ACCOUNTS.leaderB);
    await leaderB.goto("/calendar/new");
    await leaderB.getByLabel("일정명").fill("E2E 무대팀 일정");
    await leaderB.getByLabel("시작", { exact: true }).fill(`${today}T09:00`);
    await leaderB.getByLabel("종료").fill(`${today}T10:00`);
    await leaderB.getByRole("button", { name: "등록" }).click();
    await expect(leaderB).toHaveURL(/\/calendar$/);
    // 팀장 범위 선택지에는 '동아리 전체'가 없다.
    await leaderB.goto("/calendar/new");
    await expect(leaderB.getByLabel("일정 범위").locator("option")).toHaveCount(1);

    const id = await eventId("E2E 무대팀 일정");
    await loginAs(page, ACCOUNTS.leaderA);
    expect((await page.goto(`/calendar/${id}`))?.status()).toBe(403);
  });

  test("운영진은 일정을 수정하고 삭제할 수 있다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("E2E 수정 대상");
    await page.getByLabel("시작", { exact: true }).fill(`${today}T09:00`);
    await page.getByLabel("종료").fill(`${today}T10:00`);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    const id = await eventId("E2E 수정 대상");

    await page.goto(`/calendar/${id}`);
    await page.getByLabel("일정명").fill("E2E 수정 완료");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await page.goto(`/calendar?month=${month}`);
    await expect(page.getByTestId("calendar-list")).toContainText("E2E 수정 완료");

    await page.goto(`/calendar/${id}`);
    await page.getByRole("button", { name: "일정 삭제" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await page.goto(`/calendar?month=${month}`);
    await expect(page.getByTestId("calendar-list")).not.toContainText("E2E 수정 완료");
    expect((await page.goto(`/calendar/${id}`))?.status()).toBe(404);
  });

  test("종료가 시작보다 빠르면 서버가 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("잘못된 일정");
    await page.getByLabel("시작", { exact: true }).fill(`${today}T10:00`);
    await page.getByLabel("종료").fill(`${today}T09:00`);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page.getByTestId("action-message")).toContainText("종료 시각");
  });
});
