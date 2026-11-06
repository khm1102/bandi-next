import { expect, test, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, loginAs, resetSeed } from "./support";

type Role = "anon" | "member" | "leader" | "admin";
type Expectation = Record<Role, number>;

/**
 * USER_FLOW.md 권한 매트릭스의 실행 가능한 형태.
 * 302/307 = 로그인 화면으로 리다이렉트, 401 = 인증 필요(API), 403 = 권한 없음.
 */
const PAGES: [string, Expectation][] = [
  ["/login", { anon: 200, member: 307, leader: 307, admin: 307 }],
  ["/privacy", { anon: 200, member: 200, leader: 200, admin: 200 }],
  ["/support", { anon: 200, member: 200, leader: 200, admin: 200 }],
  ["/dashboard", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/calendar", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/calendar/new", { anon: 307, member: 403, leader: 200, admin: 200 }],
  ["/notices", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/notices/write", { anon: 307, member: 403, leader: 200, admin: 200 }],
  ["/notices/manage", { anon: 307, member: 403, leader: 200, admin: 200 }],
  ["/resources", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/resources/write", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/activity", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/activity/new", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/activity/archive", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/activity/review", { anon: 307, member: 403, leader: 200, admin: 200 }],
  ["/activity-documents", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/props", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/props/new", { anon: 307, member: 403, leader: 403, admin: 200 }],
  ["/props?deleted=1", { anon: 307, member: 403, leader: 403, admin: 200 }],
  ["/profile", { anon: 307, member: 200, leader: 200, admin: 200 }],
  ["/onboarding", { anon: 307, member: 200, leader: 200, admin: 200 }],
  // 현행 정책 유지: 팀 멤버 화면은 팀장 전용(운영진은 /members 사용)
  ["/team-members", { anon: 307, member: 403, leader: 200, admin: 403 }],
  ["/members", { anon: 307, member: 403, leader: 403, admin: 200 }],
];

const API: [string, Expectation][] = [
  ["/api/activity-reviews/export", { anon: 401, member: 403, leader: 403, admin: 200 }],
  ["/api/activity-documents/blank", { anon: 401, member: 200, leader: 200, admin: 200 }],
  ["/api/activity-documents/participants?q=Member", { anon: 401, member: 200, leader: 200, admin: 200 }],
];

const ACCOUNT: Record<Exclude<Role, "anon">, string> = { member: ACCOUNTS.memberA, leader: ACCOUNTS.leaderA, admin: ACCOUNTS.admin };

async function status(request: APIRequestContext, path: string): Promise<number> {
  return (await request.get(path, { maxRedirects: 0 })).status();
}

test.beforeEach(async () => {
  await resetSeed();
});

for (const role of ["anon", "member", "leader", "admin"] as const) {
  test(`권한 매트릭스 — ${role}`, async ({ page, request }) => {
    let client: APIRequestContext = request;
    if (role !== "anon") {
      await loginAs(page, ACCOUNT[role]);
      client = page.context().request;
    }
    const failures: string[] = [];
    for (const [path, expected] of [...PAGES, ...API]) {
      const actual = await status(client, path);
      if (actual !== expected[role]) failures.push(`${path}: 기대 ${expected[role]} / 실제 ${actual}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test.describe("보호 대상 객체 (IDOR) — 존재하지 않는 ID도 권한 없는 사용자에게는 404/403 중 하나로만 응답", () => {
  test("비로그인은 어떤 API·파일 경로도 열 수 없다", async ({ request }) => {
    for (const path of [
      "/api/resources/1/files/1/download",
      "/api/internal-notices/1/attachments/1/download",
      "/api/internal-notice-management/1/attachments/1/download",
      "/api/activity-records/1/files/1/download",
      "/api/activity-management/1/files/1/download",
      "/api/activity-reviews/1/files/1/download",
      "/api/assets/1/photo",
      "/api/members/1/profile-photo",
    ]) {
      expect(await status(request, path), path).toBe(401);
    }
  });

  test("일반 멤버가 관리 API 경로를 열면 존재 여부와 무관하게 거부된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.memberA);
    const client = page.context().request;
    for (const path of ["/api/internal-notice-management/999999/attachments/1/download", "/api/activity-reviews/999999/files/1/download", "/api/activity-management/999999/files/1/download"]) {
      expect([403, 404], path).toContain(await status(client, path));
    }
  });
});

test.describe("메서드·출처 검증", () => {
  test("상태 변경 API는 Origin 없이는 로그인 상태여도 거부된다", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    const client = page.context().request;
    for (const [method, path] of [
      ["post", "/api/files/1/public-promotions"],
      ["put", "/api/members/me/profile-photo"],
      ["delete", "/api/members/me/profile-photo"],
    ] as const) {
      const response = await client[method](path, { data: {} });
      expect([403], `${method} ${path}`).toContain(response.status());
    }
  });
});
