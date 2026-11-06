import { expect, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";
const ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function memberId(studentNo: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query("select id from member where student_no = $1", [studentNo]);
  await pool.end();
  return rows[0].id;
}

const upload = (request: APIRequestContext, name: string, body: Buffer, mimeType = "image/png", withOrigin = true) =>
  request.post("/api/files/private?domain=resource", {
    headers: withOrigin ? { origin: ORIGIN } : {},
    multipart: { file: { name, mimeType, buffer: body } },
  });

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("파일 업로드 API", () => {
  test("비로그인은 401이다", async ({ request }) => {
    const response = await upload(request, "a.png", PNG);
    expect(response.status()).toBe(401);
  });

  test("Origin 없는 상태 변경 요청은 CSRF로 거부된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const response = await upload(page.context().request, "a.png", PNG, "image/png", false);
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe("CSRF_REJECTED");
  });

  test("다른 사이트 Origin도 거부된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const response = await page.context().request.post("/api/files/private?domain=resource", {
      headers: { origin: "https://evil.example.com" },
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(response.status()).toBe(403);
  });

  test("정상 이미지는 201과 파일 ID를 반환한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const response = await upload(page.context().request, "a.png", PNG);
    expect(response.status()).toBe(201);
    expect((await response.json()).id).toBeGreaterThan(0);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("내용과 확장자가 다르거나 허용되지 않은 형식은 400이다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const request = page.context().request;
    expect((await upload(request, "fake.png", Buffer.from("<html>"), "image/png")).status()).toBe(400);
    expect((await upload(request, "run.exe", Buffer.from("MZ"), "application/octet-stream")).status()).toBe(400);
    expect((await upload(request, "page.html", Buffer.from("<script>"), "text/html")).status()).toBe(400);
  });

  test("허용되지 않은 도메인 값은 400이다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const response = await page.context().request.post("/api/files/private?domain=../../etc", {
      headers: { origin: ORIGIN },
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("프로필 사진 API", () => {
  test("본인이 올리면 다른 멤버가 볼 수 있고 보안 헤더가 붙는다", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await loginAs(a, ACCOUNTS.memberA);
    const put = await a.context().request.put("/api/members/me/profile-photo", {
      headers: { origin: ORIGIN },
      multipart: { file: { name: "me.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(put.status()).toBe(204);

    const b = await (await browser.newContext()).newPage();
    await loginAs(b, ACCOUNTS.memberB);
    const id = await memberId(ACCOUNTS.memberA);
    const get = await b.context().request.get(`/api/members/${id}/profile-photo`);
    expect(get.status()).toBe(200);
    expect(get.headers()["content-type"]).toBe("image/png");
    expect(get.headers()["x-content-type-options"]).toBe("nosniff");
    expect(get.headers()["cache-control"]).toContain("private");

    const anonymous = await (await browser.newContext()).request.get(`/api/members/${id}/profile-photo`);
    expect(anonymous.status()).toBe(401);

    const del = await a.context().request.delete("/api/members/me/profile-photo", { headers: { origin: ORIGIN } });
    expect(del.status()).toBe(204);
    expect((await b.context().request.get(`/api/members/${id}/profile-photo`)).status()).toBe(404);
  });

  test("프로필 사진에 이미지가 아닌 파일은 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const response = await page.context().request.put("/api/members/me/profile-photo", {
      headers: { origin: ORIGIN },
      multipart: { file: { name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 x") } },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("공개 승격", () => {
  test("일반 멤버는 403, 운영진은 본인이 올린 파일을 승격할 수 있다", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const mine = await (await upload(page.context().request, "a.png", PNG)).json();
    const denied = await page.context().request.post(`/api/files/${mine.id}/public-promotions`, {
      headers: { origin: ORIGIN },
      data: { domain: "resource" },
    });
    expect(denied.status()).toBe(403);

    const admin = await (await browser.newContext()).newPage();
    await loginAs(admin, ACCOUNTS.admin);
    const adminFile = await (await upload(admin.context().request, "b.png", PNG)).json();
    const promoted = await admin.context().request.post(`/api/files/${adminFile.id}/public-promotions`, {
      headers: { origin: ORIGIN },
      data: { domain: "resource" },
    });
    expect(promoted.status()).toBe(201);
    // 타인(MemberA)의 파일은 운영진이라도 승격할 수 없다 (업로더 본인만).
    const foreign = await admin.context().request.post(`/api/files/${mine.id}/public-promotions`, {
      headers: { origin: ORIGIN },
      data: { domain: "resource" },
    });
    expect(foreign.status()).toBe(403);
  });
});
