import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function itemId(name: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from asset_item where name = $1", [name]);
  await pool.end();
  return rows[0].id;
}

async function register(page: Page, name: string, opts: { individual?: boolean; photo?: boolean } = {}) {
  await page.goto("/props/new");
  await page.getByLabel("품목명").fill(name);
  await page.getByLabel("분류").fill("소품");
  if (opts.individual) await page.getByLabel("관리 방식").selectOption("INDIVIDUAL");
  await page.getByLabel("보관 위치").fill("창고 A");
  if (opts.photo) {
    await page.getByLabel("사진 첨부").setInputFiles({ name: "item.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("선택한 사진: item.png")).toBeVisible();
  }
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/props\/\d+$/);
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("소품·장비", () => {
  test("일반 멤버는 관리 화면이 아예 열리지 않고 목록에도 관리 버튼이 없다 (이전 Spring의 갭 보완)", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/props");
    await expect(page.getByRole("link", { name: "품목 등록" })).toHaveCount(0);
    for (const path of ["/props/new", "/props/1/edit"]) {
      expect((await page.goto(path))?.status()).toBe(403);
    }
    expect((await page.goto("/props?deleted=1"))?.status()).toBe(403);
  });

  test("팀장도 관리 화면에 접근할 수 없다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.leaderA);
    expect((await page.goto("/props/new"))?.status()).toBe(403);
  });

  test("운영진이 사진과 함께 등록하면 멤버가 목록·상세·사진을 볼 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await register(page, "E2E 검", { photo: true });
    const id = await itemId("E2E 검");
    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    await member.goto("/props?q=E2E");
    await expect(member.getByTestId("props-list")).toContainText("E2E 검");
    await member.goto(`/props/${id}`);
    await expect(member.getByTestId("asset-history")).toContainText("등록");
    const photo = await member.context().request.get(`/api/assets/${id}/photo`);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toBe("image/png");
    const anonymous = await (await browser.newContext()).request.get(`/api/assets/${id}/photo`);
    expect(anonymous.status()).toBe(401);
  });

  test("상태 변경과 이력, 개별 장비 등록", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await register(page, "E2E 마이크", { individual: true });
    await page.getByLabel("상태", { exact: true }).selectOption("REPAIR");
    await page.getByRole("button", { name: "상태 변경" }).click();
    await expect(page.getByTestId("asset-status")).toHaveText("수리 중");
    await page.getByLabel("관리번호").fill("MIC-01");
    await page.getByLabel("보관 위치", { exact: true }).last().fill("방송실");
    await page.getByRole("button", { name: "장비 등록" }).click();
    await expect(page.getByTestId("unit-list")).toContainText("MIC-01");
    await expect(page.getByTestId("asset-history")).toContainText("수리");
  });

  test("삭제하면 목록에서 사라지고 삭제됨 목록에서 복구할 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin);
    await register(page, "E2E 삭제 소품");
    const id = await itemId("E2E 삭제 소품");
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page).toHaveURL(/\/props$/);
    await expect(page.getByTestId("props-list")).not.toContainText("E2E 삭제 소품");

    const member = await (await browser.newContext()).newPage();
    await loginAs(member, ACCOUNTS.memberA);
    expect((await member.goto(`/props/${id}`))?.status()).toBe(404);

    await page.goto("/props?deleted=1");
    await expect(page.getByTestId("props-list")).toContainText("E2E 삭제 소품");
    await page.getByRole("button", { name: "복구" }).click();
    // 복구되면 삭제됨 목록에서 사라진다.
    await expect(page.getByTestId("props-list")).not.toContainText("E2E 삭제 소품");
    await page.goto("/props");
    await expect(page.getByTestId("props-list")).toContainText("E2E 삭제 소품");
  });

  test("서버는 잘못된 소유 정보를 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/props/new");
    await page.getByLabel("품목명").fill("E2E 잘못된 소유");
    await page.getByLabel("분류").fill("소품");
    await page.getByLabel("보관 위치").fill("창고");
    await page.locator('select[name="ownerType"]').selectOption("MEMBER");
    await page.getByLabel("소유 멤버 학번").fill("0000000000");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByTestId("action-message")).toContainText("멤버를 찾을 수 없습니다");
  });
});
