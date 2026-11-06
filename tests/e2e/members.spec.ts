import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginAs, newSession, resetSeed } from "./support";

test.beforeEach(async () => {
  await resetSeed();
});

test.describe("멤버 관리 권한", () => {
  test("일반 멤버는 멤버 관리·팀 멤버 화면에 접근할 수 없고 메뉴에도 보이지 않는다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await expect(page.getByRole("link", { name: "멤버 관리" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "팀 멤버" })).toHaveCount(0);
    for (const path of ["/members", "/team-members"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
      await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
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
    await page.getByRole("link", { name: "관리", exact: true }).first().click();
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
    await page.getByRole("link", { name: "관리", exact: true }).first().click();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "활동 상태" }) });
    await card.getByLabel("상태").selectOption("SUSPENDED");
    await card.getByLabel("변경 사유").evaluate((el) => el.removeAttribute("required"));
    await card.getByRole("button", { name: "상태 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("사유");
  });

  test("본인의 ADMIN 권한은 스스로 내릴 수 없다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/members?q=AdminX");
    await page.getByRole("link", { name: "관리", exact: true }).first().click();
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
    await page.getByRole("link", { name: "관리", exact: true }).first().click();
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
    const card = page.locator("section", { has: page.getByRole("heading", { name: "사전 등록" }) });
    await card.getByLabel("학번").fill(ACCOUNTS.memberA);
    await card.getByLabel("이름").fill("중복");
    await card.getByRole("button", { name: "사전 등록" }).click();
    await expect(card.getByTestId("action-message")).toContainText("이미 등록된 학번");

    await card.getByLabel("학번").fill("9100000001");
    await card.getByLabel("이름").fill("신입생");
    await card.getByRole("button", { name: "사전 등록" }).click();
    await expect(card.getByTestId("action-message")).toContainText("사전 등록했습니다");
  });
});

test.describe("내 프로필", () => {
  test("본인 팀을 사유와 함께 변경하면 이력이 남고 화면에 반영된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    await page.goto("/profile");
    await expect(page.locator("dd", { hasText: "배우" })).toBeVisible();
    const card = page.locator("section", { has: page.getByRole("heading", { name: "팀 변경" }) });
    await card.getByLabel("새 팀").selectOption({ label: "무대팀" });
    await card.getByLabel("변경 사유").fill("희망 팀 이동");
    await card.getByRole("button", { name: "팀 변경" }).click();
    await expect(card.getByTestId("action-message")).toContainText("팀을 변경했습니다");
    await page.reload();
    await expect(page.locator("dd", { hasText: "무대팀" })).toBeVisible();
  });
});
