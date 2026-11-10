import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function resourceId(title: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from resource where title = $1 and deleted_at is null", [title]);
  await pool.end();
  return rows[0].id;
}

async function write(page: Page, title: string, body: string) {
  await page.goto("/resources/write");
  await page.getByLabel("제목", { exact: true }).fill(title);
  await page.getByRole("textbox", { name: "본문", exact: true }).fill(body);
  await page.getByRole("button", { name: "자료 저장" }).click();
  await expect(page).toHaveURL(/\/resources\/\d+$/);
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("자료실", () => {
  test("멤버가 작성하면 다른 멤버가 목록에서 검색해 열람한다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E 대본 자료", "## 1막\n\n**중요** 대사");
    await expect(page.getByRole("heading", { name: "1막" })).toBeVisible();

    const other = await (await browser.newContext()).newPage();
    await loginAs(other, ACCOUNTS.memberB);
    await other.goto("/resources?q=대본");
    await expect(other.getByTestId("resource-list")).toContainText("E2E 대본 자료");
    await other.getByTestId("resource-list").locator("article", { hasText: "E2E 대본 자료" }).getByRole("link", { name: "상세 보기" }).click();
    await expect(other.getByRole("heading", { name: "1막" })).toBeVisible();
    await expect(other.getByRole("link", { name: "수정" })).toHaveCount(0);
  });

  test("작성자만 수정·삭제하고, 다른 멤버와 팀장은 수정 화면이 403이다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E 수정 자료", "원본");
    const id = await resourceId("E2E 수정 자료");

    for (const account of [ACCOUNTS.memberB, ACCOUNTS.leaderA]) {
      const stranger = await (await browser.newContext()).newPage();
      await loginAs(stranger, account);
      expect((await stranger.goto(`/resources/${id}/edit`))?.status()).toBe(403);
      await stranger.context().close();
    }

    await page.goto(`/resources/${id}/edit`);
    await page.getByLabel("제목", { exact: true }).fill("E2E 수정 완료");
    await page.getByRole("button", { name: "자료 저장" }).click();
    await expect(page.getByRole("heading", { name: "E2E 수정 완료" })).toBeVisible();

    await page.getByRole("button", { name: "자료 삭제" }).click();
    await expect(page).toHaveURL(/\/resources$/);
    expect((await page.goto(`/resources/${id}`))?.status()).toBe(404);
  });

  test("운영진은 타인의 자료를 수정할 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E 운영진 수정", "원본");
    const id = await resourceId("E2E 운영진 수정");
    const admin = await (await browser.newContext()).newPage();
    await loginAs(admin, ACCOUNTS.admin);
    await admin.goto(`/resources/${id}/edit`);
    await admin.getByLabel("제목", { exact: true }).fill("E2E 운영진이 수정함");
    await admin.getByRole("button", { name: "자료 저장" }).click();
    await expect(admin.getByRole("heading", { name: "E2E 운영진이 수정함" })).toBeVisible();
  });

  test("본문 스크립트·외부 이미지는 렌더링되지 않는다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E 자료 XSS", '<script>window.__xss = 1</script>\n\n<img src=x onerror="window.__xss = 2">\n\n![외부](https://example.com/a.png)\n\n[링크](javascript:window.__xss=3)');
    const id = await resourceId("E2E 자료 XSS");
    const viewer = await (await browser.newContext()).newPage();
    await loginAs(viewer, ACCOUNTS.memberB);
    await viewer.goto(`/resources/${id}`);
    await viewer.waitForTimeout(300);
    expect(await viewer.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(viewer.locator("[onerror]")).toHaveCount(0);
    await expect(viewer.locator('img[src*="example.com"]')).toHaveCount(0);
    await expect(viewer.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test("첨부 파일을 올리고 다른 멤버가 내려받을 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/resources/write");
    await page.getByLabel("제목", { exact: true }).fill("E2E 첨부 자료");
    await page.getByRole("textbox", { name: "본문", exact: true }).fill("첨부 확인");
    await page.getByLabel("파일 첨부").setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("poster.png")).toBeVisible();
    await page.getByRole("button", { name: "자료 저장" }).click();
    await expect(page).toHaveURL(/\/resources\/\d+$/);
    const href = await page.getByTestId("attachments").getByRole("link", { name: "poster.png" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/resources\/\d+\/files\/\d+\/download$/);

    const other = await (await browser.newContext()).newPage();
    await loginAs(other, ACCOUNTS.memberB);
    const response = await other.context().request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    const anonymous = await (await browser.newContext()).request.get(href!);
    expect(anonymous.status()).toBe(401);
  });

  test("업로드 형식이 잘못되면 편집기에 오류가 보인다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/resources/write");
    await page.getByLabel("파일 첨부").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await expect(page.getByText("업로드할 수 없는 파일입니다.")).toBeVisible();
  });

  test("내부 주소 URL은 링크 카드로 만들어지지 않는다 (SSRF)", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E SSRF 자료", "https://127.0.0.1/admin\n\nhttps://169.254.169.254/latest/meta-data");
    await expect(page.getByTestId("link-cards")).toHaveCount(0);
  });

  test("제목 공개 링크는 비로그인에게 제목만 보여주고 중단하면 404이다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await write(page, "E2E 공유 자료", "비밀 본문");
    await page.getByRole("button", { name: "공유", exact: true }).click();
    const link = (await page.getByTestId("share-link").textContent())!.trim();
    expect(link).toMatch(/\/share\/resources\/[A-Za-z0-9_-]{43}$/);
    const anonymous = await (await browser.newContext()).newPage();
    await anonymous.goto(link);
    await expect(anonymous.getByRole("heading", { name: "E2E 공유 자료" })).toBeVisible();
    await expect(anonymous.getByText("비밀 본문")).toHaveCount(0);
    await page.getByRole("button", { name: "공유 중단" }).click();
    await expect(page.getByTestId("share-status")).toContainText("공유 링크를 중단했습니다");
    expect((await anonymous.goto(link))?.status()).toBe(404);
  });
});
