import { expect, test, type Browser, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function recordId(title: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from activity_record where title = $1", [title]);
  await pool.end();
  return rows[0].id;
}

async function as(browser: Browser, studentNo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, studentNo);
  return page;
}

async function writeAndSubmit(page: Page, title: string) {
  await page.goto("/activity/new");
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill("연습 내용");
  await page.getByLabel("사진 첨부").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("p.png")).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/activity\/\d+$/);
  await page.getByRole("button", { name: "검수 요청" }).click();
  await expect(page.getByTestId("activity-status")).toHaveText("검수 대기");
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("활동 기록 검수 흐름", () => {
  test("작성 → 제출 → 팀장 1차 승인 → 운영진 최종 승인 → 보관함에서 다른 팀 멤버가 열람", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E 연습 기록");
    const id = await recordId("E2E 연습 기록");

    const leader = await as(browser, ACCOUNTS.leaderA);
    await leader.goto("/activity/review");
    await expect(leader.getByTestId("review-list")).toContainText("E2E 연습 기록");
    await leader.goto(`/activity/review/${id}`);
    await leader.getByRole("button", { name: "팀장 1차 승인" }).click();
    await expect(leader.getByTestId("activity-status")).toHaveText("팀장 승인");

    const admin = await as(browser, ACCOUNTS.admin);
    await admin.goto(`/activity/review/${id}`);
    await admin.getByRole("button", { name: "최종 승인" }).click();
    await expect(admin.getByTestId("activity-status")).toHaveText("최종 승인");

    const other = await as(browser, ACCOUNTS.memberB);
    await other.goto("/activity/archive");
    await expect(other.getByTestId("archive-list")).toContainText("E2E 연습 기록");
    await other.getByTestId("archive-list").locator("article", { hasText: "E2E 연습 기록" }).getByRole("link", { name: "상세 보기" }).click();
    const href = await other.getByTestId("archive-files").getByRole("link").first().getAttribute("href");
    expect((await other.context().request.get(href!)).status()).toBe(200);
  });

  test("승인 전 기록은 다른 멤버가 상세·보관함·파일로 볼 수 없다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E 비공개 기록");
    const id = await recordId("E2E 비공개 기록");
    const other = await as(browser, ACCOUNTS.memberB);
    expect((await other.goto(`/activity/${id}`))?.status()).toBe(403);
    expect((await other.goto(`/activity/archive/${id}`))?.status()).toBe(404);
    await other.goto("/activity/archive");
    // 승인 전 기록은 보관함 어디에도 나오지 않는다 (목록이 비면 목록 요소 자체가 없다).
    await expect(other.getByText("E2E 비공개 기록")).toHaveCount(0);
    for (const path of ["/activity/review", `/activity/review/${id}`]) {
      expect((await other.goto(path))?.status()).toBe(403);
    }
  });

  test("다른 팀 팀장은 검수 상세에 접근할 수 없다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E 타팀 검수");
    const id = await recordId("E2E 타팀 검수");
    const leaderB = await as(browser, ACCOUNTS.leaderB);
    expect((await leaderB.goto(`/activity/review/${id}`))?.status()).toBe(403);
    await leaderB.goto("/activity/review");
    await expect(leaderB.getByText("E2E 타팀 검수")).toHaveCount(0);
  });

  test("보완 요청 → 수정 → 재제출", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E 보완 기록");
    const id = await recordId("E2E 보완 기록");
    const leader = await as(browser, ACCOUNTS.leaderA);
    await leader.goto(`/activity/review/${id}`);
    await leader.getByLabel("보완 사유 (필수)").fill("사진을 더 선명하게");
    await leader.getByRole("button", { name: "보완 요청" }).click();
    await expect(leader.getByTestId("activity-status")).toHaveText("보완 요청");

    await page.goto(`/activity/${id}`);
    await expect(page.getByTestId("activity-status")).toHaveText("보완 요청");
    await expect(page.getByTestId("activity-history")).toContainText("사진을 더 선명하게");
    await page.getByRole("link", { name: "수정" }).click();
    await page.getByLabel("내용").fill("보완한 내용");
    await page.getByRole("button", { name: "저장" }).click();
    await page.getByRole("button", { name: "검수 요청" }).click();
    await expect(page.getByTestId("activity-status")).toHaveText("검수 대기");
  });

  test("긴급 최종 승인은 사유가 필요하다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E 긴급 승인");
    const id = await recordId("E2E 긴급 승인");
    const admin = await as(browser, ACCOUNTS.admin);
    await admin.goto(`/activity/review/${id}`);
    await admin.getByLabel("긴급 승인 사유 (필수)").evaluate((el) => el.removeAttribute("required"));
    await admin.getByRole("button", { name: "긴급 최종 승인" }).click();
    await expect(admin.getByTestId("action-message")).toContainText("사유");
    await admin.getByLabel("긴급 승인 사유 (필수)").fill("행사 임박");
    await admin.getByRole("button", { name: "긴급 최종 승인" }).click();
    await expect(admin.getByTestId("activity-status")).toHaveText("최종 승인");
  });

  test("CSV 내려받기는 운영진만 가능하다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await writeAndSubmit(page, "E2E CSV 기록");
    const admin = await as(browser, ACCOUNTS.admin);
    const csv = await admin.context().request.get("/api/activity-reviews/export");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("E2E CSV 기록");
    const leader = await as(browser, ACCOUNTS.leaderA);
    expect((await leader.context().request.get("/api/activity-reviews/export")).status()).toBe(403);
  });
});

/** 원본 document.jsp 흐름으로 내역서 입력: 참여자는 "직접 입력 추가"로 행을 만든 뒤 이름을 넣는다. */
async function fillReport(page: Page, title: string, participants: string[], photo = true) {
  await page.goto("/activity-documents");
  await page.getByLabel("활동 기록 제목").fill(title);
  await page.getByLabel("대표자").fill("홍대표");
  await page.getByLabel("활동 장소").fill("소극장");
  await page.getByRole("textbox", { name: "활동 내용" }).fill("블로킹 연습\n조명 확인");
  if (photo) await page.locator('input[type="file"][aria-label="활동 사진"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  for (const [index, name] of participants.entries()) {
    await page.getByRole("button", { name: "직접 입력 추가" }).click();
    await page.getByLabel(`참여자 ${index + 1} 이름`).fill(name);
  }
}

test.describe("HWPX 활동 내역서", () => {
  test("입력 → 임시 저장 → 생성된 HWPX 다운로드 → 검수 요청", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await fillReport(page, "E2E 내역서", ["김참여", "이참여"]);
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByTestId("saved-notice")).toContainText("임시 저장했어요");

    const href = await page.getByTestId("hwpx-link").getAttribute("href");
    const response = await page.context().request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/hwp+zip");
    const zip = unzipSync(new Uint8Array(await response.body()));
    const section = strFromU8(zip["Contents/section0.xml"]);
    expect(section).toContain("홍대표");
    expect(section).toContain("김참여");
    expect(section).toContain("참여인원 총 02명");

    await page.getByRole("button", { name: "검수 요청", exact: true }).click();
    await expect(page.getByTestId("saved-notice")).toContainText("운영진에게 검수를 요청했어요");
    const id = await recordId("E2E 내역서");
    await page.goto(`/activity/${id}`);
    await expect(page.getByTestId("activity-status")).toHaveText("검수 대기");
  });

  test("저장 후 검수 요청은 한 번에 저장과 제출을 끝낸다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await fillReport(page, "E2E 바로 제출", ["김참여"]);
    await page.getByRole("button", { name: "저장 후 검수 요청" }).click();
    await expect(page.getByTestId("saved-notice")).toContainText("운영진에게 검수를 요청했어요");
    // 제출 후에는 입력을 고칠 수 없다.
    await expect(page.getByLabel("활동 기록 제목")).toBeDisabled();
    const id = await recordId("E2E 바로 제출");
    await page.goto(`/activity/${id}`);
    await expect(page.getByTestId("activity-status")).toHaveText("검수 대기");
  });

  test("필수 항목이 비면 필드마다 오류를 보여주고 기록을 만들지 않는다 (사진 없음 포함)", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await fillReport(page, "E2E 사진 없음", ["김참여"], false);
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText("활동 사진을 선택해 주세요.")).toBeVisible();
    await page.getByLabel("대표자").fill("");
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText("대표자를 입력해 주세요.")).toBeVisible();
    const pool = new Pool({ connectionString: DB_URL });
    const { rows } = await pool.query("select count(*)::int as n from activity_record where title = $1", ["E2E 사진 없음"]);
    await pool.end();
    expect(rows[0].n).toBe(0);
  });

  test("빈 양식 다운로드와 참여자 자동완성", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const blank = await page.context().request.get("/api/activity-documents/blank");
    expect(blank.status()).toBe(200);
    expect(blank.headers()["content-type"]).toBe("application/hwp+zip");
    const names = await (await page.context().request.get("/api/activity-documents/participants?q=Member")).json();
    expect(names.map((n: { name: string }) => n.name)).toEqual(expect.arrayContaining(["MemberA", "MemberB"]));
    expect(Object.keys(names[0]).sort()).toEqual(["department", "name", "studentNo"]);
    expect((await page.context().request.get("/api/activity-documents/participants?q=a")).status()).toBe(400);
  });

  test("다른 사람의 내역서 초안은 열 수 없다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await fillReport(page, "E2E 내 내역서", ["김참여"]);
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByTestId("saved-notice")).toBeVisible();
    const id = await recordId("E2E 내 내역서");
    const other = await as(browser, ACCOUNTS.memberB);
    expect((await other.goto(`/activity-documents?draft=${id}`))?.status()).toBe(403);
  });
});
