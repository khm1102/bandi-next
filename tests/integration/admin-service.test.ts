import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member, schoolLoginAttempt, session } from "@/features/member/schema";
import { activityRecord } from "@/features/activity/schema";
import { internalNotice, internalNoticeRead } from "@/features/notice/schema";
import { assetItem } from "@/features/asset/schema";
import { auditLog } from "@/features/audit/schema";
import { createAdminService } from "@/features/admin/service";
import { DEFAULT_HOME, DEFAULT_NAV } from "@/features/admin/settings-model";

let db: NodePgDatabase;
let clock = new Date("2026-11-10T03:00:00Z");
const SECRET = "test-hmac-secret-123";
const service = () => createAdminService({ db, hashSecret: SECRET, now: () => clock });
const hashOf = (studentNo: string) => createHmac("sha256", SECRET).update(studentNo).digest("hex");

let cohortId: number;
async function seed(studentNo: string, name: string, overrides: Partial<typeof member.$inferInsert> = {}) {
  const [row] = await db
    .insert(member)
    .values({ studentNo, name, teamId: 3, cohortId, role: "MEMBER", status: "ACTIVE", ssoLinkStatus: "LINKED", ...overrides })
    .returning();
  return row;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  clock = new Date("2026-11-10T03:00:00Z");
  await resetData(db);
  [{ id: cohortId }] = await db.insert(cohort).values({ name: "1-1" }).returning();
});

describe("권한", () => {
  it("운영진이 아니면 설정 저장·통계·계정 운영·감사 로그·내보내기를 모두 거부한다", async () => {
    const leader = await seed("9000000003", "LeaderA", { role: "LEADER" });
    const target = await seed("9000000001", "MemberA");
    const s = service();
    const denied = { kind: "forbidden" };
    await expect(s.saveHome(leader.id, DEFAULT_HOME)).rejects.toMatchObject(denied);
    await expect(s.saveNav(leader.id, DEFAULT_NAV)).rejects.toMatchObject(denied);
    await expect(s.stats(leader.id)).rejects.toMatchObject(denied);
    await expect(s.searchAccounts(leader.id, {})).rejects.toMatchObject(denied);
    await expect(s.unlockLogin(leader.id, target.id)).rejects.toMatchObject(denied);
    await expect(s.requirePasswordReset(leader.id, target.id, "사유")).rejects.toMatchObject(denied);
    await expect(s.searchAudit(leader.id, {})).rejects.toMatchObject(denied);
    await expect(s.exportMembersCsv(leader.id)).rejects.toMatchObject(denied);
  });

  it("정지된 운영진도 거부한다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN", status: "SUSPENDED" });
    await expect(service().stats(admin.id)).rejects.toMatchObject({ kind: "forbidden" });
  });
});

describe("화면 설정", () => {
  it("저장한 적이 없으면 기본값(원본 배치)을 돌려준다", async () => {
    expect(await service().home()).toEqual(DEFAULT_HOME);
    expect(await service().nav()).toEqual(DEFAULT_NAV);
  });

  it("저장 값은 정규화되어 저장되고, 변경은 감사 로그에 남는다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    await service().saveHome(admin.id, { cardOrder: ["quick", "bogus"], hidden: ["attention", "<script>"] });
    expect(await service().home()).toEqual({ cardOrder: ["quick", "schedule", "notices"], hidden: ["attention"] });
    await service().saveNav(admin.id, { hidden: ["props", "dashboard"] });
    expect((await service().nav()).hidden).toEqual(["props"]);
    const logs = await db.select().from(auditLog);
    expect(logs.map((l) => l.action)).toEqual(["SETTINGS_CHANGED", "SETTINGS_CHANGED"]);
    expect(logs[0]).toMatchObject({ actorMemberId: admin.id, targetType: "SETTING" });
  });

  it("기본값으로 되돌리면 저장된 값을 지운다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    await service().saveHome(admin.id, { hidden: ["stats"] });
    await service().resetSettings(admin.id, "home");
    expect(await service().home()).toEqual(DEFAULT_HOME);
  });
});

describe("통계", () => {
  it("팀별 활동 인원, 멤버 상태, 월별 활동 기록, 소품 상태, 공지 읽음률을 집계한다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    const a = await seed("9000000001", "MemberA");
    const b = await seed("9000000002", "MemberB", { teamId: 4 });
    await seed("9000000006", "Pending", { status: "PRE_REGISTERED", ssoLinkStatus: "WAITING" });
    await seed("9000000007", "Gone", { status: "WITHDRAWN" });

    // 상태별 시각 제약: 제출 이후 상태는 제출 시각, 승인은 검수 시각·검수자가 필요하다.
    const record = (title: string, status: string, activityAt: string) => ({
      teamId: 3, title, body: "내용", participantCount: 3, status, activityAt: new Date(activityAt), createdByMemberId: a.id, updatedByMemberId: a.id,
      submittedAt: status === "DRAFT" ? null : new Date(activityAt),
      reviewedAt: status === "APPROVED" ? new Date(activityAt) : null,
      reviewedByMemberId: status === "APPROVED" ? admin.id : null,
    });
    await db.insert(activityRecord).values([
      record("초안", "DRAFT", "2026-11-02T03:00:00Z"),
      record("제출", "SUBMITTED", "2026-11-03T03:00:00Z"),
      record("승인", "APPROVED", "2026-11-04T03:00:00Z"),
      record("지난달 승인", "APPROVED", "2026-10-20T03:00:00Z"),
    ]);
    await db.insert(assetItem).values([
      { name: "마이크", category: "AUDIO", trackingType: "QUANTITY", ownerType: "CLUB", totalQuantity: 1, storageLocation: "창고", status: "AVAILABLE" },
      { name: "조명", category: "LIGHTING", trackingType: "QUANTITY", ownerType: "CLUB", totalQuantity: 1, storageLocation: "창고", status: "REPAIR" },
    ]);
    const [notice] = await db
      .insert(internalNotice)
      .values({ targetScope: "ALL", title: "전체 공지", body: "본문", status: "PUBLISHED", publishStartAt: new Date("2026-11-05T00:00:00Z"), createdByMemberId: admin.id, updatedByMemberId: admin.id, publishedByMemberId: admin.id })
      .returning();
    await db.insert(internalNoticeRead).values({ internalNoticeId: notice.id, memberId: a.id, firstReadAt: clock, lastReadAt: clock });

    const stats = await service().stats(admin.id);
    expect(stats.activeMembers).toBe(3);
    expect(stats.membersByStatus).toMatchObject({ ACTIVE: 3, PRE_REGISTERED: 1, WITHDRAWN: 1 });
    expect(stats.activeByTeam.find((t) => t.teamId === 3)?.count).toBe(2);
    expect(stats.activeByTeam.find((t) => t.teamId === 4)?.count).toBe(1);
    // 최근 6개월(KST), 오래된 달부터. 제출 수는 초안을 제외한 기록, 승인 수는 최종 승인 기록.
    expect(stats.monthlyActivity).toHaveLength(6);
    expect(stats.monthlyActivity.at(-1)).toEqual({ month: "2026-11", submitted: 2, approved: 1 });
    expect(stats.monthlyActivity.at(-2)).toEqual({ month: "2026-10", submitted: 1, approved: 1 });
    expect(stats.assetsByStatus).toMatchObject({ AVAILABLE: 1, REPAIR: 1 });
    // 전체 공지 대상은 활동 중 멤버 3명, 그중 1명이 읽음.
    expect(stats.recentNotices[0]).toMatchObject({ title: "전체 공지", readers: 1, targets: 3 });
    void b;
  });
});

describe("계정 운영", () => {
  it("비밀번호 설정 여부와 로그인 잠금 상태를 보여주고, 잠긴 계정만 거를 수 있다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN", passwordHash: "scrypt$x" });
    const locked = await seed("9000000001", "MemberA");
    await db.insert(schoolLoginAttempt).values({ studentNoHash: hashOf("9000000001"), failureCount: 5, blockedUntil: new Date(clock.getTime() + 10 * 60_000) });
    const all = await service().searchAccounts(admin.id, {});
    expect(all.items.find((m) => m.id === admin.id)).toMatchObject({ hasPassword: true, lockedUntil: null });
    expect(all.items.find((m) => m.id === locked.id)).toMatchObject({ hasPassword: false, lockedUntil: new Date(clock.getTime() + 10 * 60_000) });
    const onlyLocked = await service().searchAccounts(admin.id, { filter: "locked" });
    expect(onlyLocked.items.map((m) => m.id)).toEqual([locked.id]);
    const noPassword = await service().searchAccounts(admin.id, { filter: "no-password" });
    expect(noPassword.items.map((m) => m.id)).toEqual([locked.id]);
  });

  it("잠금을 해제하면 실패 기록을 지우고 감사 로그를 남긴다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    const target = await seed("9000000001", "MemberA");
    await db.insert(schoolLoginAttempt).values({ studentNoHash: hashOf("9000000001"), failureCount: 5, blockedUntil: new Date(clock.getTime() + 60_000) });
    await service().unlockLogin(admin.id, target.id);
    expect(await db.select().from(schoolLoginAttempt)).toHaveLength(0);
    const [log] = await db.select().from(auditLog);
    expect(log).toMatchObject({ action: "MEMBER_LOGIN_UNLOCKED", targetType: "MEMBER", targetId: target.id });
  });

  it("비밀번호 재설정을 요구하면 비밀번호를 지우고 기존 세션을 끊는다 (사유 필수, 본인 불가)", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN", passwordHash: "scrypt$admin" });
    const target = await seed("9000000001", "MemberA", { passwordHash: "scrypt$member", passwordSetAt: clock });
    await db.insert(session).values({ tokenHash: "a".repeat(64), memberId: target.id, expiresAt: new Date(clock.getTime() + 3600_000) });

    await expect(service().requirePasswordReset(admin.id, target.id, "  ")).rejects.toMatchObject({ kind: "invalid" });
    await expect(service().requirePasswordReset(admin.id, admin.id, "실수 방지")).rejects.toMatchObject({ kind: "invalid" });

    await service().requirePasswordReset(admin.id, target.id, "비밀번호 유출 의심");
    const [after] = await db.select().from(member).where(eq(member.id, target.id));
    expect(after).toMatchObject({ passwordHash: null, passwordSetAt: null });
    expect(await db.select().from(session).where(eq(session.memberId, target.id))).toHaveLength(0);
    const [log] = await db.select().from(auditLog);
    expect(log).toMatchObject({ action: "MEMBER_PASSWORD_RESET", targetId: target.id });
    expect(log.summary).toContain("비밀번호 유출 의심");
  });

  it("감사 로그는 최신순으로 처리자 이름과 함께 보여주고 동작으로 거를 수 있다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    const target = await seed("9000000001", "MemberA");
    await service().unlockLogin(admin.id, target.id);
    clock = new Date(clock.getTime() + 60_000);
    await service().saveHome(admin.id, { hidden: ["stats"] });
    const result = await service().searchAudit(admin.id, {});
    expect(result.items.map((e) => e.action)).toEqual(["SETTINGS_CHANGED", "MEMBER_LOGIN_UNLOCKED"]);
    expect(result.items[0].actorName).toBe("AdminX");
    const filtered = await service().searchAudit(admin.id, { action: "MEMBER_LOGIN_UNLOCKED" });
    expect(filtered.items).toHaveLength(1);
  });
});

describe("데이터 내보내기", () => {
  it("멤버 명단 CSV는 BOM과 머리글을 갖고, 수식으로 해석될 셀을 무력화하며, 내보내기를 감사 로그에 남긴다", async () => {
    const admin = await seed("9000000005", "AdminX", { role: "ADMIN" });
    await seed("9000000001", "=HYPERLINK(\"evil\")", { phoneNumber: "010-1234-5678" });
    const csv = await service().exportMembersCsv(admin.id);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, ...rows] = csv.slice(1).trim().split("\r\n");
    expect(header).toBe('"학번","이름","팀","기수","역할","활동 상태","SSO 연결","휴대폰","마지막 로그인"');
    expect(rows).toHaveLength(2);
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
    const [log] = await db.select().from(auditLog);
    expect(log).toMatchObject({ action: "DATA_EXPORTED", targetType: "EXPORT" });
    expect(log.detail).toMatchObject({ kind: "members", rows: 2 });
  });
});
