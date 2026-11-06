import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";

async function login(page: Page, studentNo: string, password = "pw") {
  await page.getByLabel("학번").fill(studentNo);
  await page.getByLabel("학교 포털 비밀번호").fill(password);
  await page.getByRole("button", { name: "학교 계정으로 로그인" }).click();
}

test.describe("로그인", () => {
  test("비로그인으로 보호 화면에 가면 로그인으로 이동하고, 로그인 후 원래 화면으로 돌아온다", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await login(page, "9000000001");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("strong", { hasText: "MemberA" })).toBeVisible();
  });

  test("잘못된 비밀번호는 오류 메시지를 보여주고 학번 입력은 유지한다", async ({ page }) => {
    await page.goto("/login");
    await login(page, "9000000002", "wrong");
    await expect(page.locator("p[role=alert]")).toContainText("학번 또는 비밀번호가 올바르지 않습니다");
    await expect(page.getByLabel("학번")).toHaveValue("9000000002");
    await expect(page).toHaveURL(/\/login/);
  });

  test("등록되지 않은 학번은 안내 메시지를 보여준다", async ({ page }) => {
    // 가짜 SSO에 없는 학번은 자격증명 오류로 처리된다(미등록 판정은 SSO 성공 이후).
    await page.goto("/login");
    await login(page, "1234567890");
    await expect(page.locator("p[role=alert]")).toBeVisible();
  });

  test("숫자가 아닌 학번은 서버 검증으로 거부한다", async ({ page }) => {
    await page.goto("/login");
    await login(page, "abc");
    await expect(page.locator("p[role=alert]")).toContainText("숫자");
  });

  test("로그인 후 next 파라미터가 외부 주소면 무시하고 홈으로 간다", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example.com");
    await login(page, "9000000003");
    await expect(page).toHaveURL(/localhost:3100\/dashboard$/);
  });

  test("로그아웃하면 세션이 폐기되어 보호 화면에 다시 들어갈 수 없다", async ({ page, context }) => {
    await page.goto("/login");
    await login(page, "9000000005");
    await expect(page).toHaveURL(/\/dashboard$/);
    const [cookie] = (await context.cookies()).filter((c) => c.name === "bandi_session");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // 폐기된 토큰을 그대로 재사용해도 인증되지 않는다.
    await context.addCookies([{ ...cookie, value: cookie.value }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("5회 연속 실패하면 올바른 비밀번호도 15분간 차단한다", async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    await pool.query("delete from school_login_attempt");
    await page.goto("/login");
    const submit = async (password: string) => {
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/login"));
      await login(page, "9000000004", password);
      await posted;
    };
    for (let i = 0; i < 5; i++) {
      await submit("bad");
    }
    await expect(page.locator("p[role=alert]")).toContainText("너무 많습니다");
    await submit("pw");
    await expect(page.locator("p[role=alert]")).toContainText("너무 많습니다");
    await expect(page).toHaveURL(/\/login/);
    await pool.query("delete from school_login_attempt");
    await pool.end();
  });
});
