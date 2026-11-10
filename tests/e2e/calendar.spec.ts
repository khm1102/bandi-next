import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, fillDateTime, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
// 목록 보기는 기준 날짜가 속한 주의 일정을 보여준다.
const listUrl = `/calendar?view=list&date=${today}`;

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
    await fillDateTime(page, "시작", `${today}T09:00`);
    await fillDateTime(page, "종료", `${today}T10:00`);
    await page.getByRole("button", { name: "일정 저장" }).click();
    await expect(page).toHaveURL(/\/calendar(\?|$)/);

    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    await member.goto(listUrl);
    await expect(member.getByTestId("calendar-list")).toContainText("E2E 전체 회의");
    await expect(member.getByRole("link", { name: "일정 등록" })).toHaveCount(0);
    expect((await member.goto("/calendar/new"))?.status()).toBe(403);
  });

  test("종일 일정은 마지막 날을 포함해 저장되고 수정 화면에도 그대로 보인다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("E2E 종일 행사");
    await page.getByLabel("종일").check();
    await fillDateTime(page, "시작일", today);
    await fillDateTime(page, "마지막 날", today);
    await page.getByRole("button", { name: "일정 저장" }).click();
    await expect(page).toHaveURL(/\/calendar(\?|$)/);
    const id = await eventId("E2E 종일 행사");
    await page.goto(`/calendar/${id}`);
    await expect(page.getByLabel("종일")).toBeChecked();
    await expect(page.getByLabel("마지막 날 날짜", { exact: true })).toHaveValue(today);
  });

  test("팀장은 자기 팀 일정만 관리하고 다른 팀 일정 화면은 403이다", async ({ page, browser }) => {
    const leaderB = await (await browser.newContext()).newPage();
    await loginAs(leaderB, ACCOUNTS.leaderB);
    await leaderB.goto("/calendar/new");
    await leaderB.getByLabel("일정명").fill("E2E 무대팀 일정");
    await fillDateTime(leaderB, "시작", `${today}T09:00`);
    await fillDateTime(leaderB, "종료", `${today}T10:00`);
    await leaderB.getByRole("button", { name: "일정 저장" }).click();
    await expect(leaderB).toHaveURL(/\/calendar(\?|$)/);
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
    await fillDateTime(page, "시작", `${today}T09:00`);
    await fillDateTime(page, "종료", `${today}T10:00`);
    await page.getByRole("button", { name: "일정 저장" }).click();
    await expect(page).toHaveURL(/\/calendar(\?|$)/);
    const id = await eventId("E2E 수정 대상");

    await page.goto(`/calendar/${id}`);
    await page.getByLabel("일정명").fill("E2E 수정 완료");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(/\/calendar(\?|$)/);
    await page.goto(listUrl);
    await expect(page.getByTestId("calendar-list")).toContainText("E2E 수정 완료");

    await page.goto(`/calendar/${id}`);
    await page.getByRole("button", { name: "일정 삭제" }).click();
    await expect(page).toHaveURL(/\/calendar(\?|$)/);
    await page.goto(listUrl);
    await expect(page.getByTestId("calendar-list")).not.toContainText("E2E 수정 완료");
    expect((await page.goto(`/calendar/${id}`))?.status()).toBe(404);
  });

  test("종료가 시작보다 빠르면 서버가 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/calendar/new");
    await page.getByLabel("일정명").fill("잘못된 일정");
    await fillDateTime(page, "시작", `${today}T10:00`);
    await fillDateTime(page, "종료", `${today}T09:00`);
    await page.getByRole("button", { name: "일정 저장" }).click();
    await expect(page.getByTestId("action-message")).toContainText("종료 시각");
  });

  test("FullCalendar 화면: 일정 상세 모달, 팀 필터, 보기 전환, 날짜 클릭으로 등록 화면 채우기", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    for (const [title, team] of [["E2E 전체 일정", "all"], ["E2E 무대팀 일정", "4"]] as const) {
      await page.goto("/calendar/new");
      await page.getByLabel("일정명").fill(title);
      await page.getByLabel("일정 범위").selectOption(team);
      await fillDateTime(page, "시작", `${today}T19:00`);
      await fillDateTime(page, "종료", `${today}T20:00`);
      await page.getByRole("button", { name: "일정 저장" }).click();
      await expect(page).toHaveURL(/\/calendar(\?|$)/);
    }

    const member = await (await browser.newContext({ locale: "ko-KR", timezoneId: "Asia/Seoul" })).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    await member.goto(`/calendar?view=month&date=${today}`);
    await member.getByRole("button", { name: /E2E 전체 일정/ }).first().click();
    const dialog = member.getByRole("dialog", { name: "일정 상세" });
    await expect(dialog).toContainText("E2E 전체 일정");
    await expect(dialog).toContainText("전체 일정");
    // 일반 멤버에게는 수정·삭제가 없다.
    await expect(dialog.getByRole("link", { name: "일정 수정" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "일정 삭제" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "닫기" }).first().click();

    // 팀 필터: 배우팀을 고르면 무대팀 일정은 빠지고 전체 일정은 남는다.
    await member.getByLabel("표시할 팀").selectOption({ label: "배우" });
    await expect(member.getByTestId("calendar-list")).toContainText("E2E 전체 일정");
    await expect(member.getByTestId("calendar-list")).not.toContainText("E2E 무대팀 일정");
    await expect(member).toHaveURL(/team=3/);

    // 보기 전환과 제목
    await member.getByRole("button", { name: "목록", exact: true }).click();
    await expect(member).toHaveURL(/view=list/);
    await member.getByRole("button", { name: "주", exact: true }).click();
    await expect(member).toHaveURL(/view=week/);

    // 운영진은 날짜를 누르면 그 날짜로 채운 등록 화면이 열린다.
    // 일정이 없는 날(7일 뒤)의 빈 칸을 누른다.
    const later = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/calendar?view=month&date=${later}`);
    const cell = page.locator(`[data-date="${later}"][role="cell"]`).first();
    await expect(cell).toBeVisible();
    await page.waitForLoadState("networkidle");
    const box = (await cell.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 12);
    await expect(page).toHaveURL(/\/calendar\/new\?start=/);
    await expect(page.getByLabel("시작일 날짜", { exact: true })).toHaveValue(later);
    await member.context().close();
  });
});
