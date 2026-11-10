import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { ACCOUNTS, resetSeed } from "./support";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";

/** 반디 계정 로그인 (학번 + 반디 비밀번호). 시드 계정의 비밀번호는 "pw"이다. */
async function login(page: Page, studentNo: string, password = "pw") {
  await page.getByLabel("학번", { exact: true }).fill(studentNo);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}

/** 학교 계정 인증 (가짜 SSO: 시드 학번 + "pw"). */
async function verifySchool(page: Page, studentNo: string, schoolPassword = "pw") {
  await page.getByLabel("학교 포털 아이디 (학번)").fill(studentNo);
  await page.getByLabel("학교 포털 비밀번호").fill(schoolPassword);
  await page.getByRole("button", { name: "학교 계정으로 인증" }).click();
}

async function setPassword(page: Page, password: string, confirm = password) {
  await page.getByLabel("새 비밀번호", { exact: true }).fill(password);
  await page.getByLabel("새 비밀번호 확인").fill(confirm);
  await page.getByRole("button", { name: "비밀번호 설정하고 시작하기" }).click();
}

async function withDb<T>(work: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("반디 계정 로그인", () => {
  test("비로그인으로 보호 화면에 가면 로그인으로 이동하고, 로그인 후 원래 화면으로 돌아온다", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await login(page, ACCOUNTS.memberA);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("MemberA");
  });

  test("잘못된 비밀번호는 오류 메시지를 보여주고 학번 입력은 유지한다", async ({ page }) => {
    await page.goto("/login");
    await login(page, ACCOUNTS.memberB, "wrong-password");
    await expect(page.locator("#authError")).toContainText("학번 또는 비밀번호를 다시 확인해 주세요");
    await expect(page.getByLabel("학번", { exact: true })).toHaveValue(ACCOUNTS.memberB);
    await expect(page).toHaveURL(/\/login/);
  });

  test("없는 학번과 비밀번호 미설정 계정도 같은 문구로 거부한다 (계정 존재 여부를 알리지 않는다)", async ({ page }) => {
    await withDb((pool) => pool.query("update member set password_hash = null where student_no = $1", [ACCOUNTS.memberB]));
    await page.goto("/login");
    const submit = async (studentNo: string) => {
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login");
      await login(page, studentNo);
      await posted;
      await expect(page.locator("#authError")).toBeVisible();
      return page.locator("#authError").innerText();
    };
    const unknown = await submit("1234567890");
    const noPassword = await submit(ACCOUNTS.memberB);
    expect(unknown).toContain("학번 또는 비밀번호를 다시 확인해 주세요");
    expect(noPassword).toBe(unknown);
  });

  test("숫자가 아닌 학번은 서버 검증으로 거부한다", async ({ page }) => {
    await page.goto("/login");
    await login(page, "abc");
    await expect(page.locator("#authError")).toContainText("숫자");
  });

  test("로그인 후 next 파라미터가 외부 주소면 무시하고 홈으로 간다", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example.com");
    await login(page, ACCOUNTS.leaderA);
    await expect(page).toHaveURL(/localhost:3100\/dashboard$/);
  });

  test("로그아웃하면 세션이 폐기되어 보호 화면에 다시 들어갈 수 없다", async ({ page, context }) => {
    await page.goto("/login");
    await login(page, ACCOUNTS.admin);
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
    await page.goto("/login");
    const submit = async (password: string) => {
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login");
      await login(page, ACCOUNTS.leaderB, password);
      await posted;
    };
    for (let i = 0; i < 5; i++) {
      await submit("bad-password");
    }
    await expect(page.locator("#authError")).toContainText("15분");
    await submit("pw");
    await expect(page.locator("#authError")).toContainText("15분");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("학교 계정 인증 후 비밀번호 설정", () => {
  test("처음 사용자는 학교 인증 → 비밀번호 설정 → 바로 로그인되고, 이후 새 비밀번호로 로그인한다", async ({ page, context }) => {
    await withDb((pool) => pool.query("update member set password_hash = null, password_set_at = null where student_no = $1", [ACCOUNTS.memberB]));
    await page.goto("/login");
    await page.getByRole("link", { name: "학교 계정으로 인증하고 비밀번호 설정" }).click();
    await expect(page).toHaveURL(/\/login\/verify/);
    await verifySchool(page, ACCOUNTS.memberB);
    await expect(page).toHaveURL(/\/login\/password/);

    // 정책 위반은 거부하고 티켓은 계속 쓸 수 있다.
    await setPassword(page, "short");
    await expect(page.locator("#authError")).toContainText("10자 이상");
    await setPassword(page, ACCOUNTS.memberB);
    await expect(page.locator("#authError")).toContainText("학번과 같은");
    await setPassword(page, "my-new-password-1", "my-new-password-2");
    await expect(page.locator("#authError")).toContainText("일치하지 않아요");

    await setPassword(page, "my-new-password-1");
    await expect(page).toHaveURL(/\/dashboard$/);
    // 설정이 끝나면 일회용 티켓 쿠키는 지워진다.
    expect((await context.cookies()).map((c) => c.name)).not.toContain("bandi_pw_setup");

    const stored = await withDb((pool) => pool.query("select password_hash from member where student_no = $1", [ACCOUNTS.memberB]));
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].password_hash).not.toContain("my-new-password-1");

    await page.getByRole("button", { name: "로그아웃" }).click();
    await login(page, ACCOUNTS.memberB, "my-new-password-1");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("비밀번호를 잊은 사용자는 학교 인증으로 재설정하고, 예전 비밀번호는 더 이상 쓸 수 없다", async ({ page }) => {
    await page.goto("/login/verify");
    await verifySchool(page, ACCOUNTS.memberA);
    await expect(page).toHaveURL(/\/login\/password/);
    await setPassword(page, "reset-password-12");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "로그아웃" }).click();
    await login(page, ACCOUNTS.memberA, "pw");
    await expect(page.locator("#authError")).toContainText("학번 또는 비밀번호를 다시 확인해 주세요");
    await login(page, ACCOUNTS.memberA, "reset-password-12");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("학교 인증이 실패하면 비밀번호 설정 화면으로 넘어가지 않는다", async ({ page, context }) => {
    await page.goto("/login/verify");
    await verifySchool(page, ACCOUNTS.memberA, "wrong-school-password");
    await expect(page.locator("#authError")).toContainText("학교 계정 확인 필요");
    await expect(page).toHaveURL(/\/login\/verify/);
    expect((await context.cookies()).map((c) => c.name)).not.toContain("bandi_pw_setup");
  });

  test("학교 인증 없이 비밀번호 설정 화면에 들어가면 학교 인증으로 돌려보낸다", async ({ page }) => {
    await page.goto("/login/password");
    await expect(page).toHaveURL(/\/login\/verify/);
  });

  test("만료된 티켓으로는 비밀번호를 설정할 수 없다", async ({ page }) => {
    await page.goto("/login/verify");
    await verifySchool(page, ACCOUNTS.memberA);
    await expect(page).toHaveURL(/\/login\/password/);
    await withDb((pool) => pool.query("update password_setup_ticket set expires_at = now() - interval '1 minute'"));
    await setPassword(page, "late-password-123");
    // 만료되면 학교 인증 화면으로 돌아가 안내를 보여 주고, 비밀번호는 바뀌지 않는다.
    await expect(page).toHaveURL(/\/login\/verify\?expired=1/);
    await expect(page.getByTestId("setup-expired")).toContainText("비밀번호 설정 시간 만료");
    await page.goto("/login");
    await login(page, ACCOUNTS.memberA, "pw");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
