import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member, memberChangeHistory, schoolLoginAttempt, session } from "@/features/member/schema";
import { createAuthService } from "@/features/member/auth-service";
import { createFakeSsoClient } from "@/features/member/sso/fake";
import { createSessionStore, hashToken } from "@/lib/session-store";

let db: NodePgDatabase;
let clock = new Date("2026-11-07T00:00:00Z");
const now = () => clock;
const limits = { maxFailures: 5, failureWindowMs: 15 * 60_000, cooldownMs: 15 * 60_000 };

const service = () =>
  createAuthService({ db, sso: createFakeSsoClient(), limits, hashSecret: "test-hmac-secret-123", now });

async function seedMember(studentNo: string, name: string, overrides: Partial<typeof member.$inferInsert> = {}) {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({
      studentNo,
      name,
      teamId: 3,
      cohortId: c.id,
      role: "MEMBER",
      status: "PRE_REGISTERED",
      ssoLinkStatus: "WAITING",
      ...overrides,
    })
    .returning();
  return row;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  clock = new Date("2026-11-07T00:00:00Z");
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
});

describe("학교 인증 서비스", () => {
  it("사전 등록 멤버의 첫 인증은 ACTIVE로 연결하고 상태 이력을 남긴다", async () => {
    const seeded = await seedMember("9000000001", "MemberA");
    const result = await service().authenticate({ studentNo: "9000000001", password: "pw" });
    expect(result).toMatchObject({ memberId: seeded.id, role: "MEMBER" });
    const [after] = await db.select().from(member).where(eq(member.id, seeded.id));
    expect(after).toMatchObject({ status: "ACTIVE", ssoLinkStatus: "LINKED", academicStatus: "ENROLLED" });
    expect(after.lastLoginAt).toEqual(clock);
    const history = await db.select().from(memberChangeHistory);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ field: "STATUS", oldValue: "PRE_REGISTERED", newValue: "ACTIVE" });
  });

  it("등록되지 않은 학번은 거부한다", async () => {
    await expect(service().authenticate({ studentNo: "9000000002", password: "pw" })).rejects.toMatchObject({
      loginCode: "member-not-registered",
    });
  });

  it("이름이 다른 멤버는 검토 대기(link-pending)로 표시한다", async () => {
    const seeded = await seedMember("9000000001", "다른이름");
    await expect(service().authenticate({ studentNo: "9000000001", password: "pw" })).rejects.toMatchObject({
      loginCode: "link-pending",
    });
    const [after] = await db.select().from(member).where(eq(member.id, seeded.id));
    expect(after.ssoLinkStatus).toBe("REVIEW_REQUIRED");
    expect(after.status).toBe("PRE_REGISTERED");
  });

  it.each(["SUSPENDED", "WITHDRAWN", "REGISTRATION_CANCELLED"])("%s 멤버는 로그인할 수 없다", async (status) => {
    await seedMember("9000000001", "MemberA", { status });
    await expect(service().authenticate({ studentNo: "9000000001", password: "pw" })).rejects.toMatchObject({
      loginCode: "member-restricted",
    });
  });

  it("잘못된 비밀번호는 실패 횟수를 해시 기준으로 누적하고, 학번 원문은 저장하지 않는다", async () => {
    await seedMember("9000000001", "MemberA");
    await expect(service().authenticate({ studentNo: "9000000001", password: "x" })).rejects.toMatchObject({
      loginCode: "bad-credentials",
    });
    const rows = await db.select().from(schoolLoginAttempt);
    expect(rows).toHaveLength(1);
    expect(rows[0].failureCount).toBe(1);
    expect(rows[0].studentNoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].studentNoHash).not.toContain("9000000001");
  });

  it("5회 실패하면 15분간 차단하고, 차단 중에는 올바른 비밀번호도 거부한다", async () => {
    await seedMember("9000000001", "MemberA");
    const svc = service();
    for (let i = 0; i < 4; i++) {
      await expect(svc.authenticate({ studentNo: "9000000001", password: "x" })).rejects.toMatchObject({
        loginCode: "bad-credentials",
      });
    }
    await expect(svc.authenticate({ studentNo: "9000000001", password: "x" })).rejects.toMatchObject({
      loginCode: "login-rate-limited",
    });
    await expect(svc.authenticate({ studentNo: "9000000001", password: "pw" })).rejects.toMatchObject({
      loginCode: "login-rate-limited",
    });
    clock = new Date(clock.getTime() + 16 * 60_000);
    await expect(svc.authenticate({ studentNo: "9000000001", password: "pw" })).resolves.toBeDefined();
  });

  it("성공한 인증은 실패 상태를 즉시 지운다", async () => {
    await seedMember("9000000001", "MemberA");
    const svc = service();
    await expect(svc.authenticate({ studentNo: "9000000001", password: "x" })).rejects.toBeDefined();
    await svc.authenticate({ studentNo: "9000000001", password: "pw" });
    expect(await db.select().from(schoolLoginAttempt)).toHaveLength(0);
  });
});

describe("세션 저장소", () => {
  const store = () => createSessionStore({ db, ttlMs: 30 * 60_000, now });

  it("토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED" });
    const token = await store().issue(m.id, "jest");
    const rows = await db.select().from(session);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(rows[0].tokenHash).not.toBe(token);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("유효한 토큰은 현재 멤버를 반환하고 만료를 연장한다", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED", role: "LEADER" });
    const s = store();
    const token = await s.issue(m.id, null);
    clock = new Date(clock.getTime() + 20 * 60_000);
    const principal = await s.resolve(token);
    expect(principal).toMatchObject({ memberId: m.id, role: "LEADER", teamId: 3 });
    expect(principal?.access.canManageTeam(3)).toBe(true);
    clock = new Date(clock.getTime() + 20 * 60_000); // 발급 40분 후지만 연장되어 유효
    expect(await s.resolve(token)).not.toBeNull();
  });

  it("만료된 토큰·없는 토큰은 null이다", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED" });
    const s = store();
    const token = await s.issue(m.id, null);
    clock = new Date(clock.getTime() + 31 * 60_000);
    expect(await s.resolve(token)).toBeNull();
    expect(await s.resolve("nope")).toBeNull();
    expect(await s.resolve(undefined)).toBeNull();
  });

  it("역할 변경은 다음 요청에 즉시 반영된다 (세션에 권한을 캐시하지 않는다)", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED", role: "ADMIN" });
    const s = store();
    const token = await s.issue(m.id, null);
    expect((await s.resolve(token))?.access.canManageGlobal()).toBe(true);
    await db.update(member).set({ role: "MEMBER" }).where(eq(member.id, m.id));
    expect((await s.resolve(token))?.access.canManageGlobal()).toBe(false);
  });

  it("멤버가 ACTIVE가 아니게 되면 세션을 폐기한다", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED" });
    const s = store();
    const token = await s.issue(m.id, null);
    await db.update(member).set({ status: "WITHDRAWN" }).where(eq(member.id, m.id));
    expect(await s.resolve(token)).toBeNull();
    expect(await db.select().from(session)).toHaveLength(0);
  });

  it("로그아웃은 해당 세션만, revokeAll은 멤버의 모든 세션을 폐기한다", async () => {
    const m = await seedMember("9000000001", "MemberA", { status: "ACTIVE", ssoLinkStatus: "LINKED" });
    const s = store();
    const t1 = await s.issue(m.id, null);
    const t2 = await s.issue(m.id, null);
    await s.revoke(t1);
    expect(await s.resolve(t1)).toBeNull();
    expect(await s.resolve(t2)).not.toBeNull();
    await s.revokeAll(m.id);
    expect(await s.resolve(t2)).toBeNull();
  });
});
