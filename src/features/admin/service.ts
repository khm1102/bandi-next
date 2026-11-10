import { createHmac } from "node:crypto";
import { and, asc, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/types";
import { koSort } from "@/db/columns";
import { activityRecord } from "@/features/activity/schema";
import { assetItem } from "@/features/asset/schema";
import { recordAudit } from "@/features/audit/service";
import { auditLog, AUDIT_ACTIONS, type AuditAction } from "@/features/audit/schema";
import { MEMBER_STATUSES, type MemberStatus, type Role } from "@/features/member/codes";
import { cohort, member, passwordSetupTicket, schoolLoginAttempt, session, team } from "@/features/member/schema";
import { internalNotice, internalNoticeRead } from "@/features/notice/schema";
import { toCsv } from "@/lib/csv";
import { accessFor } from "@/lib/policy";
import { AdminAccessDeniedError, InvalidAdminInputError } from "./errors";
import { appSetting } from "./schema";
import { normalizeHome, normalizeNav, type HomeSettings, type NavSettings } from "./settings-model";

export interface AdminServiceDeps {
  db: Db;
  /** 로그인 실패 제한 저장소와 같은 HMAC 비밀값 (학번 원문 대신 해시로 잠금 상태를 찾는다). */
  hashSecret: string;
  now?: () => Date;
}

export type SettingKey = "home" | "nav";
const PAGE_SIZE = 20;
const KST_OFFSET_MS = 9 * 3600_000;

/**
 * 운영진 전용 설정·통계·계정 운영·내보내기.
 * 통계와 내보내기는 여러 기능의 데이터를 읽기 전용으로 모아 집계하므로 각 테이블을 직접 조회한다
 * (쓰기는 하지 않으며, 계정 운영의 쓰기는 member 테이블과 그 세션·로그인 기록에 한정된다).
 */
export function createAdminService(deps: AdminServiceDeps) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const hashStudentNo = (studentNo: string) => createHmac("sha256", deps.hashSecret).update(studentNo).digest("hex");

  async function requireAdmin(actorId: number) {
    const [row] = await db.select().from(member).where(eq(member.id, actorId));
    if (!row || !accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus }).canManageGlobal()) {
      throw new AdminAccessDeniedError();
    }
    return row;
  }

  async function readSetting(key: SettingKey): Promise<unknown> {
    const [row] = await db.select().from(appSetting).where(eq(appSetting.key, key));
    return row?.value ?? null;
  }

  async function writeSetting(actorId: number, key: SettingKey, value: HomeSettings | NavSettings | null) {
    await db.transaction(async (tx) => {
      if (value === null) {
        await tx.delete(appSetting).where(eq(appSetting.key, key));
      } else {
        await tx
          .insert(appSetting)
          .values({ key, value, updatedAt: now(), updatedByMemberId: actorId })
          .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: now(), updatedByMemberId: actorId } });
      }
      await recordAudit(tx, {
        actorMemberId: actorId,
        action: "SETTINGS_CHANGED",
        targetType: "SETTING",
        targetId: 0,
        summary: `${key === "home" ? "홈 화면" : "메뉴"} 설정을 ${value === null ? "기본값으로 되돌림" : "변경"}`,
        detail: { key, value },
        occurredAt: now(),
      });
    });
  }

  /** 최근 6개월의 "YYYY-MM"(KST), 오래된 달부터. */
  function recentMonths(count: number): string[] {
    const shifted = new Date(now().getTime() + KST_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(Date.UTC(year, month - (count - 1 - i), 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
  }

  return {
    /** 홈 화면 설정 (모든 로그인 멤버의 홈에 적용되므로 읽기는 권한 검사 없이 제공한다). */
    async home(): Promise<HomeSettings> {
      return normalizeHome(await readSetting("home"));
    },

    async nav(): Promise<NavSettings> {
      return normalizeNav(await readSetting("nav"));
    },

    async saveHome(actorId: number, raw: unknown): Promise<HomeSettings> {
      await requireAdmin(actorId);
      const value = normalizeHome(raw);
      await writeSetting(actorId, "home", value);
      return value;
    },

    async saveNav(actorId: number, raw: unknown): Promise<NavSettings> {
      await requireAdmin(actorId);
      const value = normalizeNav(raw);
      await writeSetting(actorId, "nav", value);
      return value;
    },

    async resetSettings(actorId: number, key: SettingKey): Promise<void> {
      await requireAdmin(actorId);
      await writeSetting(actorId, key, null);
    },

    async stats(actorId: number) {
      await requireAdmin(actorId);
      const months = recentMonths(6);
      const windowStart = new Date(Date.UTC(Number(months[0].slice(0, 4)), Number(months[0].slice(5)) - 1, 1) - KST_OFFSET_MS);

      const [statusRows, teamRows, monthRows, assetRows, noticeRows] = await Promise.all([
        db.select({ status: member.status, count: sql<number>`count(*)::int` }).from(member).groupBy(member.status),
        db
          .select({ teamId: team.id, teamName: team.name, count: sql<number>`count(${member.id})::int` })
          .from(team)
          .leftJoin(member, and(eq(member.teamId, team.id), eq(member.status, "ACTIVE")))
          .groupBy(team.id, team.name)
          .orderBy(asc(team.id)),
        db
          .select({
            month: sql<string>`to_char(${activityRecord.activityAt} at time zone 'Asia/Seoul', 'YYYY-MM')`,
            submitted: sql<number>`count(*) filter (where ${activityRecord.status} <> 'DRAFT')::int`,
            approved: sql<number>`count(*) filter (where ${activityRecord.status} = 'APPROVED')::int`,
          })
          .from(activityRecord)
          .where(and(isNull(activityRecord.deletedAt), sql`${activityRecord.activityAt} >= ${windowStart}`))
          .groupBy(sql`1`),
        db.select({ status: assetItem.status, count: sql<number>`count(*)::int` }).from(assetItem).where(isNull(assetItem.deletedAt)).groupBy(assetItem.status),
        db
          .select({
            id: internalNotice.id,
            title: internalNotice.title,
            publishStartAt: internalNotice.publishStartAt,
            readers: sql<number>`(select count(*)::int from internal_notice_read r join member m on m.id = r.member_id where r.internal_notice_id = internal_notice.id and m.status = 'ACTIVE')`,
            targets: sql<number>`(select count(*)::int from member m where m.status = 'ACTIVE' and (internal_notice.target_scope = 'ALL' or m.team_id = internal_notice.team_id))`,
          })
          .from(internalNotice)
          .where(and(isNull(internalNotice.deletedAt), isNotNull(internalNotice.publishStartAt)))
          .orderBy(desc(internalNotice.publishStartAt), desc(internalNotice.id))
          .limit(5),
      ]);

      const membersByStatus = Object.fromEntries(MEMBER_STATUSES.map((s) => [s, 0])) as Record<MemberStatus, number>;
      for (const row of statusRows) membersByStatus[row.status as MemberStatus] = row.count;
      const byMonth = new Map(monthRows.map((row) => [row.month, row]));
      return {
        activeMembers: membersByStatus.ACTIVE,
        membersByStatus,
        activeByTeam: teamRows,
        monthlyActivity: months.map((month) => ({ month, submitted: byMonth.get(month)?.submitted ?? 0, approved: byMonth.get(month)?.approved ?? 0 })),
        assetsByStatus: Object.fromEntries(assetRows.map((row) => [row.status, row.count])) as Record<string, number>,
        recentNotices: noticeRows,
      };
    },

    /** 계정 상태 목록: 비밀번호 설정 여부, 로그인 잠금, 마지막 로그인. 동아리 규모(수백 명)라 메모리에서 거른다. */
    async searchAccounts(actorId: number, filter: { keyword?: string; filter?: "locked" | "no-password"; page?: number }) {
      await requireAdmin(actorId);
      const current = now();
      const [members, attempts] = await Promise.all([
        db
          .select({
            id: member.id,
            studentNo: member.studentNo,
            name: member.name,
            role: member.role,
            status: member.status,
            teamName: team.name,
            lastLoginAt: member.lastLoginAt,
            passwordSetAt: member.passwordSetAt,
            hasPassword: sql<boolean>`${member.passwordHash} is not null`,
          })
          .from(member)
          .innerJoin(team, eq(team.id, member.teamId))
          .orderBy(koSort(member.name), asc(member.id)),
        db.select().from(schoolLoginAttempt).where(gt(schoolLoginAttempt.blockedUntil, current)),
      ]);
      const blocked = new Map(attempts.map((a) => [a.studentNoHash, a.blockedUntil]));
      const keyword = filter.keyword?.trim();
      const rows = members
        .map((m) => ({ ...m, role: m.role as Role, status: m.status as MemberStatus, lockedUntil: blocked.get(hashStudentNo(m.studentNo)) ?? null }))
        .filter((m) => !keyword || m.name.includes(keyword) || m.studentNo.includes(keyword))
        .filter((m) => (filter.filter === "locked" ? m.lockedUntil !== null : filter.filter === "no-password" ? !m.hasPassword : true));
      const page = Math.max(1, Math.floor(filter.page ?? 1));
      return { total: rows.length, page, pageSize: PAGE_SIZE, items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
    },

    async unlockLogin(actorId: number, memberId: number): Promise<void> {
      await requireAdmin(actorId);
      await db.transaction(async (tx) => {
        const [target] = await tx.select().from(member).where(eq(member.id, memberId));
        if (!target) throw new InvalidAdminInputError("멤버를 찾을 수 없습니다.");
        await tx.delete(schoolLoginAttempt).where(eq(schoolLoginAttempt.studentNoHash, hashStudentNo(target.studentNo)));
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_LOGIN_UNLOCKED",
          targetType: "MEMBER",
          targetId: target.id,
          summary: `${target.name}의 로그인 잠금 해제`,
          occurredAt: now(),
        });
      });
    },

    /** 비밀번호를 지우고 기존 세션을 모두 끊는다. 멤버는 학교 계정 인증으로 새 비밀번호를 정해야 한다. */
    async requirePasswordReset(actorId: number, memberId: number, rawReason: string): Promise<void> {
      await requireAdmin(actorId);
      const reason = rawReason.trim();
      if (!reason || reason.length > 300) throw new InvalidAdminInputError("재설정 사유를 1~300자로 입력해 주세요.");
      if (memberId === actorId) throw new InvalidAdminInputError("본인 계정은 여기서 재설정할 수 없어요. 로그인 화면의 학교 계정 인증을 이용해 주세요.");
      await db.transaction(async (tx) => {
        const [target] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
        if (!target) throw new InvalidAdminInputError("멤버를 찾을 수 없습니다.");
        await tx.update(member).set({ passwordHash: null, passwordSetAt: null }).where(eq(member.id, target.id));
        await tx.delete(session).where(eq(session.memberId, target.id));
        await tx.delete(passwordSetupTicket).where(and(eq(passwordSetupTicket.memberId, target.id), isNull(passwordSetupTicket.usedAt)));
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_PASSWORD_RESET",
          targetType: "MEMBER",
          targetId: target.id,
          summary: `${target.name}의 비밀번호 재설정 요구: ${reason}`,
          occurredAt: now(),
        });
      });
    },

    async searchAudit(actorId: number, filter: { action?: AuditAction; page?: number }) {
      await requireAdmin(actorId);
      const actor = alias(member, "actor");
      const action = AUDIT_ACTIONS.find((a) => a === filter.action);
      const where = action ? eq(auditLog.action, action) : undefined;
      const page = Math.max(1, Math.floor(filter.page ?? 1));
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where);
      const items = await db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          summary: auditLog.summary,
          occurredAt: auditLog.occurredAt,
          actorName: actor.name,
        })
        .from(auditLog)
        .leftJoin(actor, eq(actor.id, auditLog.actorMemberId))
        .where(where)
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return { total, page, pageSize: PAGE_SIZE, items };
    },

    /** 멤버 명단 CSV (휴대폰 포함 — 운영진만, 내보낸 기록을 남긴다). */
    async exportMembersCsv(actorId: number): Promise<string> {
      await requireAdmin(actorId);
      const rows = await db
        .select({ m: member, teamName: team.name, cohortName: cohort.name })
        .from(member)
        .innerJoin(team, eq(team.id, member.teamId))
        .innerJoin(cohort, eq(cohort.id, member.cohortId))
        .orderBy(asc(team.id), koSort(member.name), asc(member.id));
      const csv = toCsv(
        ["학번", "이름", "팀", "기수", "역할", "활동 상태", "SSO 연결", "휴대폰", "마지막 로그인"],
        rows.map((r) => [r.m.studentNo, r.m.name, r.teamName, r.cohortName, r.m.role, r.m.status, r.m.ssoLinkStatus, r.m.phoneNumber, r.m.lastLoginAt?.toISOString() ?? ""]),
      );
      await recordAudit(db, { actorMemberId: actorId, action: "DATA_EXPORTED", targetType: "EXPORT", targetId: 0, summary: "멤버 명단 CSV 내보내기", detail: { kind: "members", rows: rows.length }, occurredAt: now() });
      return csv;
    },

    /** 공지 하나의 대상 멤버별 확인 현황 CSV. */
    async exportNoticeReadsCsv(actorId: number, noticeId: number): Promise<{ title: string; csv: string }> {
      await requireAdmin(actorId);
      const [notice] = await db.select().from(internalNotice).where(and(eq(internalNotice.id, noticeId), isNull(internalNotice.deletedAt)));
      if (!notice || !notice.publishStartAt) throw new InvalidAdminInputError("게시된 공지를 찾을 수 없습니다.");
      const rows = await db
        .select({ studentNo: member.studentNo, name: member.name, teamName: team.name, firstReadAt: internalNoticeRead.firstReadAt, lastReadAt: internalNoticeRead.lastReadAt })
        .from(member)
        .innerJoin(team, eq(team.id, member.teamId))
        .leftJoin(internalNoticeRead, and(eq(internalNoticeRead.memberId, member.id), eq(internalNoticeRead.internalNoticeId, noticeId)))
        .where(and(eq(member.status, "ACTIVE"), notice.targetScope === "TEAM" ? eq(member.teamId, notice.teamId ?? -1) : undefined))
        .orderBy(asc(team.id), koSort(member.name));
      const csv = toCsv(
        ["학번", "이름", "팀", "확인 여부", "처음 확인", "마지막 확인"],
        rows.map((r) => [r.studentNo, r.name, r.teamName, r.firstReadAt ? "확인" : "미확인", r.firstReadAt?.toISOString() ?? "", r.lastReadAt?.toISOString() ?? ""]),
      );
      await recordAudit(db, { actorMemberId: actorId, action: "DATA_EXPORTED", targetType: "EXPORT", targetId: noticeId, summary: `공지 확인 현황 CSV 내보내기: ${notice.title}`, detail: { kind: "notice-reads", noticeId, rows: rows.length }, occurredAt: now() });
      return { title: notice.title, csv };
    },

    /** 내보내기 화면에서 고를 수 있는 최근 게시 공지 */
    async exportableNotices(actorId: number) {
      await requireAdmin(actorId);
      return db
        .select({ id: internalNotice.id, title: internalNotice.title, publishStartAt: internalNotice.publishStartAt })
        .from(internalNotice)
        .where(and(isNull(internalNotice.deletedAt), isNotNull(internalNotice.publishStartAt)))
        .orderBy(desc(internalNotice.publishStartAt))
        .limit(50);
    },
  };
}
