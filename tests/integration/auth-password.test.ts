import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member, passwordSetupTicket, schoolLoginAttempt } from "@/features/member/schema";
import { createAuthService } from "@/features/member/auth-service";
import { hashPassword } from "@/features/member/password";
import { createFakeSsoClient } from "@/features/member/sso/fake";
import { hashToken } from "@/lib/session-store";

let db: NodePgDatabase;
let clock = new Date("2026-11-10T00:00:00Z");
const now = () => clock;
const limits = { maxFailures: 5, failureWindowMs: 15 * 60_000, cooldownMs: 15 * 60_000 };
const service = () => createAuthService({ db, sso: createFakeSsoClient(), limits, hashSecret: "test-hmac-secret-123", now });
const GOOD = "safe-password-1";

async function seedMember(studentNo: string, name: string, overrides: Partial<typeof member.$inferInsert> = {}) {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({ studentNo, name, teamId: 3, cohortId: c.id, role: "MEMBER", status: "PRE_REGISTERED", ssoLinkStatus: "WAITING", ...overrides })
    .returning();
  return row;
}
const withPassword = async (studentNo: string, name: string, overrides: Partial<typeof member.$inferInsert> = {}) =>
  seedMember(studentNo, name, { status: "ACTIVE", ssoLinkStatus: "LINKED", passwordHash: await hashPassword(GOOD), passwordSetAt: clock, ...overrides });

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  clock = new Date("2026-11-10T00:00:00Z");
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
});

describe("반디 비밀번호 로그인", () => {
  it("학번과 비밀번호가 맞으면 로그인하고 마지막 로그인 시각을 남긴다", async () => {
    const row = await withPassword("9000000001", "MemberA");
    const result = await service().loginWithPassword({ studentNo: "9000000001", password: GOOD });
    expect(result).toMatchObject({ memberId: row.id, role: "MEMBER" });
    const [after] = await db.select().from(member).where(eq(member.id, row.id));
    expect(after.lastLoginAt).toEqual(clock);
  });

  it("비밀번호가 틀리면 bad-credentials로 거부하고 실패를 센다", async () => {
    await withPassword("9000000001", "MemberA");
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: "wrong-password" })).rejects.toMatchObject({ loginCode: "bad-credentials" });
    const [attempt] = await db.select().from(schoolLoginAttempt);
    expect(attempt.failureCount).toBe(1);
  });

  it("없는 학번과 비밀번호 미설정 계정도 같은 bad-credentials로 거부한다 (존재 여부를 알리지 않는다)", async () => {
    await seedMember("9000000002", "MemberB"); // 비밀번호 없음
    await expect(service().loginWithPassword({ studentNo: "9000000002", password: GOOD })).rejects.toMatchObject({ loginCode: "bad-credentials" });
    await expect(service().loginWithPassword({ studentNo: "9999999999", password: GOOD })).rejects.toMatchObject({ loginCode: "bad-credentials" });
  });

  it("5번 틀리면 잠기고, 잠긴 동안은 맞는 비밀번호도 거부한다", async () => {
    await withPassword("9000000001", "MemberA");
    for (let i = 0; i < 4; i++) {
      await expect(service().loginWithPassword({ studentNo: "9000000001", password: "wrong-password" })).rejects.toMatchObject({ loginCode: "bad-credentials" });
    }
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: "wrong-password" })).rejects.toMatchObject({ loginCode: "login-rate-limited" });
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: GOOD })).rejects.toMatchObject({ loginCode: "login-rate-limited" });
    clock = new Date(clock.getTime() + 16 * 60_000);
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: GOOD })).resolves.toBeDefined();
  });

  it("성공하면 쌓인 실패 횟수를 지운다", async () => {
    await withPassword("9000000001", "MemberA");
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: "wrong-password" })).rejects.toBeDefined();
    await service().loginWithPassword({ studentNo: "9000000001", password: GOOD });
    expect(await db.select().from(schoolLoginAttempt)).toHaveLength(0);
  });

  it("정지·탈퇴한 멤버는 비밀번호가 맞아도 member-restricted로 거부한다", async () => {
    await withPassword("9000000001", "MemberA", { status: "SUSPENDED" });
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: GOOD })).rejects.toMatchObject({ loginCode: "member-restricted" });
  });
});

describe("학교 인증 후 비밀번호 설정", () => {
  it("학교 인증을 통과하면 멤버를 연결하고 일회용 티켓을 만든다 (토큰은 해시로만 저장)", async () => {
    const row = await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    const [after] = await db.select().from(member).where(eq(member.id, row.id));
    expect(after).toMatchObject({ status: "ACTIVE", ssoLinkStatus: "LINKED", passwordHash: null });
    const [ticket] = await db.select().from(passwordSetupTicket);
    expect(ticket.tokenHash).toBe(hashToken(token));
    expect(ticket.tokenHash).not.toContain(token);
    expect(ticket.expiresAt).toEqual(new Date(clock.getTime() + 10 * 60_000));
  });

  it("학교 인증이 실패하면 티켓을 만들지 않는다", async () => {
    await seedMember("9000000001", "MemberA");
    await expect(service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "wrong" })).rejects.toMatchObject({ loginCode: "bad-credentials" });
    expect(await db.select().from(passwordSetupTicket)).toHaveLength(0);
  });

  it("이름이 다르면 검토 대기로 거부하고 티켓을 만들지 않는다", async () => {
    await seedMember("9000000001", "다른이름");
    await expect(service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" })).rejects.toMatchObject({ loginCode: "link-pending" });
    expect(await db.select().from(passwordSetupTicket)).toHaveLength(0);
  });

  it("이미 비밀번호가 있는 멤버도 학교 인증으로 재설정 티켓을 받을 수 있다", async () => {
    await withPassword("9000000001", "MemberA");
    await expect(service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" })).resolves.toMatchObject({ token: expect.any(String) });
  });

  it("티켓으로 비밀번호를 설정하면 해시를 저장하고 로그인 상태가 된다", async () => {
    const row = await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    const result = await service().setPasswordWithTicket(token, GOOD, GOOD);
    expect(result.memberId).toBe(row.id);
    const [after] = await db.select().from(member).where(eq(member.id, row.id));
    expect(after.passwordHash).toMatch(/^scrypt\$/);
    expect(after.passwordHash).not.toContain(GOOD);
    expect(after.passwordSetAt).toEqual(clock);
    // 이후에는 학교 서버 없이 새 비밀번호로 로그인된다.
    await expect(service().loginWithPassword({ studentNo: "9000000001", password: GOOD })).resolves.toMatchObject({ memberId: row.id });
  });

  it("티켓은 한 번만 쓸 수 있다", async () => {
    await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    await service().setPasswordWithTicket(token, GOOD, GOOD);
    await expect(service().setPasswordWithTicket(token, "another-password-2", "another-password-2")).rejects.toMatchObject({ loginCode: "password-setup-expired" });
  });

  it("10분이 지난 티켓은 거부한다", async () => {
    await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    clock = new Date(clock.getTime() + 10 * 60_000 + 1);
    await expect(service().setPasswordWithTicket(token, GOOD, GOOD)).rejects.toMatchObject({ loginCode: "password-setup-expired" });
  });

  it("알 수 없는 토큰은 거부한다", async () => {
    await expect(service().setPasswordWithTicket("not-a-real-token", GOOD, GOOD)).rejects.toMatchObject({ loginCode: "password-setup-expired" });
  });

  it("정책 위반이면 거부하고 티켓은 그대로 쓸 수 있다", async () => {
    await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    await expect(service().setPasswordWithTicket(token, "short", "short")).rejects.toMatchObject({ name: "InvalidPasswordError" });
    await expect(service().setPasswordWithTicket(token, "9000000001", "9000000001")).rejects.toMatchObject({ name: "InvalidPasswordError" });
    await expect(service().setPasswordWithTicket(token, GOOD, GOOD)).resolves.toBeDefined();
  });

  it("티켓 확인(peek)은 유효할 때만 통과한다", async () => {
    await seedMember("9000000001", "MemberA");
    const { token } = await service().verifySchoolForPasswordSetup({ studentNo: "9000000001", password: "pw" });
    await expect(service().isPasswordSetupTicketValid(token)).resolves.toBe(true);
    await expect(service().isPasswordSetupTicketValid("nope")).resolves.toBe(false);
    clock = new Date(clock.getTime() + 11 * 60_000);
    await expect(service().isPasswordSetupTicketValid(token)).resolves.toBe(false);
  });
});
