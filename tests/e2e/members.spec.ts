import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginAs, newSession, resetSeed } from "./support";

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("멤버 관리 권한", () => {
  test("일반 멤버는 멤버 관리·팀 멤버 화면에 접근할 수 없고 메뉴에도 보이지 않는다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await expect(page.getByRole("link", { name: "멤버·권한" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "팀 멤버 관리" })).toHaveCount(0);
    for (const path of ["/members", "/team-members"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
      await expect(page.getByText("이 페이지에 접근할 권한이 없습니다.")).toBeVisible();
    }
  });

  test("팀장은 팀 멤버 화면을 볼 수 있지만 멤버 관리(ADMIN 전용)는 403이다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.leaderA);
    const ok = await page.goto("/team-members");
    expect(ok?.status()).toBe(200);
    await expect(page.getByText("MemberA", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("MemberB")).toHaveCount(0); // 다른 팀
    expect((await page.goto("/members"))?.status()).toBe(403);
  });

  test("운영진은 팀 멤버 화면(팀장 전용 현행 정책)에 접근할 수 없다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    expect((await page.goto("/team-members"))?.status()).toBe(403);
  });
});

test.describe("운영진 멤버 관리", () => {
  test("목록 검색과 상세 이동, 권한 변경 이력이 남는다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members?q=LeaderB");
    await expect(page.getByTestId("member-list").getByText("LeaderB")).toBeVisible();
    await page.getByRole("link", { name: "변경", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "LeaderB" })).toBeVisible();

    const card = page.locator("section", { has: page.getByRole("heading", { name: "권한" }) });
    await card.getByLabel("권한").selectOption("MEMBER");
    await card.getByLabel("변경 사유").fill("역할 조정");
    await card.getByRole("button", { name: "권한 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("권한을 변경했습니다");
    await expect(page.getByTestId("history-list")).toContainText("ROLE LEADER → MEMBER · 역할 조정");
  });

  test("사유 없이 제출하면 서버가 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members?q=MemberA");
    await page.getByRole("link", { name: "변경", exact: true }).first().click();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "활동 상태" }) });
    await card.getByLabel("상태").selectOption("SUSPENDED");
    await card.getByLabel("변경 사유").evaluate((el) => el.removeAttribute("required"));
    await card.getByRole("button", { name: "상태 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("사유");
  });

  test("본인의 ADMIN 권한은 스스로 내릴 수 없다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members?q=AdminX");
    await page.getByRole("link", { name: "변경", exact: true }).first().click();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "권한" }) });
    await card.getByLabel("권한").selectOption("MEMBER");
    await card.getByLabel("변경 사유").fill("테스트");
    await card.getByRole("button", { name: "권한 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText(/본인|마지막/);
  });

  test("정지된 멤버의 기존 세션은 즉시 무효가 된다", async ({ browser, page }) => {
    const victim = await newSession(browser, ACCOUNTS.memberB);
    await victim.goto("/profile");
    await expect(victim.getByRole("heading", { name: "내 프로필" })).toBeVisible();

    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members?q=MemberB");
    await page.getByRole("link", { name: "변경", exact: true }).first().click();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "활동 상태" }) });
    await card.getByLabel("상태").selectOption("SUSPENDED");
    await card.getByLabel("변경 사유").fill("정지");
    await card.getByRole("button", { name: "상태 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("변경했습니다");

    await victim.goto("/profile");
    await expect(victim).toHaveURL(/\/login/);
    await victim.context().close();
  });

  test("사전 등록은 중복 학번을 거부한다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members");
    await page.getByRole("button", { name: "+ 멤버 사전 등록" }).click();
    const dialog = page.getByRole("dialog", { name: "멤버 사전 등록" });
    await dialog.getByLabel("학번").fill(ACCOUNTS.memberA);
    await dialog.getByLabel("이름").fill("중복");
    await dialog.getByLabel("소속 팀").selectOption({ label: "배우" });
    await dialog.getByLabel("기수").selectOption({ label: "1-1" });
    await dialog.getByRole("button", { name: "등록", exact: true }).click();
    await expect(dialog.getByTestId("action-message")).toContainText("이미 등록된 학번");

    await dialog.getByLabel("학번").fill("9100000001");
    await dialog.getByLabel("이름").fill("신입생");
    await dialog.getByRole("button", { name: "등록", exact: true }).click();
    // 성공하면 모달이 닫히고 목록에 사전 등록 상태로 나타난다.
    await expect(dialog).toHaveCount(0);
    await page.goto("/members?q=9100000001");
    await expect(page.getByTestId("member-list")).toContainText("신입생");
    await expect(page.getByTestId("member-list")).toContainText("사전 등록");
  });
});

test.describe("내 프로필", () => {
  test("본인 팀을 사유와 함께 변경하면 이력이 남고 화면에 반영된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/profile");
    await expect(page.locator("dd", { hasText: "배우" })).toBeVisible();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "소속 팀 변경" }) });
    await card.getByLabel("새 소속 팀").selectOption({ label: "무대팀" });
    await card.getByLabel("변경 사유").fill("희망 팀 이동");
    await card.getByRole("button", { name: "소속 팀 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("팀을 변경했습니다");
    await page.reload();
    await expect(page.locator("dd", { hasText: "무대팀" })).toBeVisible();
  });

  test("본인 기수를 사유와 함께 바꾸면 이력이 남고 화면에 반영된다", async ({ page }) => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi" });
    await pool.query("insert into cohort (name) values ('E2E-9') on conflict do nothing");
    await pool.end();
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/profile");
    const card = page.locator("section", { has: page.getByRole("heading", { name: "기수 변경" }) });
    await card.getByLabel("새 기수").selectOption({ label: "E2E-9" });
    await card.getByLabel("변경 사유").fill("입부 기수 정정");
    await card.getByRole("button", { name: "기수 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("기수를 변경했습니다");
    await page.reload();
    await expect(page.locator("dd", { hasText: "E2E-9" })).toBeVisible();
  });
});
