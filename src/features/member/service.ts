import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { koSort } from "@/db/columns";
import type { Db, DbOrTx } from "@/db/types";
import { accessFor } from "@/lib/policy";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/features/audit/service";
import { cohort, member, memberChangeHistory, team } from "./schema";
import type { MemberChangeField, MemberStatus, Role } from "./codes";
import {
  DuplicateCohortError,
  DuplicateStudentNoError,
  InvalidCohortError,
  InvalidInputError,
  InvalidTeamError,
  LastActiveAdminError,
  MemberManagementForbiddenError,
  MemberNotFoundError,
} from "./errors";
import {
  validateCohortChange,
  validateReason,
  validateRoleChange,
  validateStatusChange,
  validateTeamChange,
} from "./model";

export interface MemberServiceDeps {
  db: Db;
  now?: () => Date;
  /** 권한·상태가 바뀐 멤버의 세션을 즉시 폐기한다 (선택). */
  revokeSessions?: (memberId: number) => Promise<void>;
}

export interface MemberListFilter {
  keyword?: string;
  teamId?: number;
  status?: MemberStatus;
  role?: Role;
  page?: number;
  pageSize?: number;
}

const STUDENT_NO = /^\d{1,20}$/;

export function createMemberService(deps: MemberServiceDeps) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  async function lockMember(tx: DbOrTx, memberId: number) {
    const [row] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!row) {
      throw new MemberNotFoundError();
    }
    return row;
  }

  const accessOf = (row: typeof member.$inferSelect) =>
    accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });

  async function requireActiveAdmin(tx: DbOrTx, actorId: number) {
    const [actor] = await tx.select().from(member).where(eq(member.id, actorId));
    if (!actor || !accessOf(actor).canManageGlobal()) {
      throw new MemberManagementForbiddenError();
    }
    return actor;
  }

  /** 활성 운영진 행을 잠근 뒤 대상 외에 다른 운영진이 남는지 확인한다 (동시 강등 경합 차단). */
  async function assertAnotherActiveAdminRemains(tx: DbOrTx, targetId: number) {
    const admins = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.role, "ADMIN"), eq(member.status, "ACTIVE")))
      .orderBy(asc(member.id))
      .for("update");
    if (!admins.some((admin) => admin.id !== targetId)) {
      throw new LastActiveAdminError();
    }
  }

  async function assertAssignableTeam(tx: DbOrTx, teamId: number) {
    const [row] = await tx.select().from(team).where(and(eq(team.id, teamId), eq(team.isActive, true)));
    if (!row) {
      throw new InvalidTeamError();
    }
  }

  async function assertAssignableCohort(tx: DbOrTx, cohortId: number) {
    const [row] = await tx.select().from(cohort).where(and(eq(cohort.id, cohortId), eq(cohort.isActive, true)));
    if (!row) {
      throw new InvalidCohortError();
    }
  }

  async function writeHistory(
    tx: DbOrTx,
    entry: {
      memberId: number;
      field: MemberChangeField;
      oldValue: string;
      newValue: string;
      reason: string;
      actorId: number;
      at: Date;
    },
  ) {
    await tx.insert(memberChangeHistory).values({
      memberId: entry.memberId,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      reason: entry.reason,
      changedByMemberId: entry.actorId,
      changedAt: entry.at,
    });
  }

  return {
    async searchTeams(activeOnly = true) {
      const rows = await db.select().from(team).orderBy(asc(team.displayOrder));
      return rows.filter((row) => !activeOnly || row.isActive).map((row) => ({ id: row.id, name: row.name }));
    },

    async searchCohorts(activeOnly = true) {
      const rows = await db.select().from(cohort).orderBy(asc(cohort.id));
      return rows.filter((row) => !activeOnly || row.isActive).map((row) => ({ id: row.id, name: row.name }));
    },

    async createCohort(actorId: number, rawName: string) {
      const name = rawName.trim();
      if (!name || name.length > 30) {
        throw new InvalidCohortError("기수 이름은 1~30자로 입력해 주세요.");
      }
      return db.transaction(async (tx) => {
        await requireActiveAdmin(tx, actorId);
        const inserted = await tx.insert(cohort).values({ name }).onConflictDoNothing().returning({ id: cohort.id });
        if (inserted.length === 0) {
          throw new DuplicateCohortError();
        }
        logger.info("기수 추가", { cohortId: inserted[0].id, actorMemberId: actorId });
        return { id: inserted[0].id, name };
      });
    },

    async preRegister(actorId: number, input: { studentNo: string; name: string; teamId: number; cohortId: number }) {
      const studentNo = input.studentNo.trim();
      const name = input.name.trim();
      if (!STUDENT_NO.test(studentNo) || !name || name.length > 50) {
        throw new InvalidInputError("학번(숫자)과 이름(50자 이하)을 확인해 주세요.");
      }
      return db.transaction(async (tx) => {
        await requireActiveAdmin(tx, actorId);
        await assertAssignableTeam(tx, input.teamId);
        await assertAssignableCohort(tx, input.cohortId);
        const inserted = await tx
          .insert(member)
          .values({
            studentNo,
            name,
            teamId: input.teamId,
            cohortId: input.cohortId,
            role: "MEMBER",
            status: "PRE_REGISTERED",
            ssoLinkStatus: "WAITING",
            registeredByMemberId: actorId,
          })
          .onConflictDoNothing()
          .returning({ id: member.id });
        if (inserted.length === 0) {
          throw new DuplicateStudentNoError();
        }
        logger.info("멤버 사전 등록", { memberId: inserted[0].id, teamId: input.teamId });
        return inserted[0].id;
      });
    },

    /** 본인 팀 변경은 활성 본인, 타인은 해당 팀 LEADER(현재 소속 기준)·ADMIN만 가능. */
    async changeTeam(actorId: number, input: { memberId: number; newTeamId: number; reason: string }) {
      const reason = validateReason(input.reason);
      await db.transaction(async (tx) => {
        const actor = await lockMember(tx, actorId);
        const target = actorId === input.memberId ? actor : await lockMember(tx, input.memberId);
        const access = accessOf(actor);
        if (!access.canChangeOwnTeam(target.id) && !access.canManageTeam(target.teamId)) {
          throw new MemberManagementForbiddenError();
        }
        validateTeamChange(target.teamId, input.newTeamId);
        await assertAssignableTeam(tx, input.newTeamId);
        const at = now();
        await tx.update(member).set({ teamId: input.newTeamId }).where(eq(member.id, target.id));
        await writeHistory(tx, {
          memberId: target.id,
          field: "TEAM",
          oldValue: String(target.teamId),
          newValue: String(input.newTeamId),
          reason,
          actorId,
          at,
        });
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_TEAM_CHANGED",
          targetType: "MEMBER",
          targetId: target.id,
          summary: "멤버 팀 변경",
          occurredAt: at,
        });
        logger.info("멤버 팀 변경", { memberId: target.id, previousTeamId: target.teamId, newTeamId: input.newTeamId });
      });
    },

    /** 기수 변경은 ADMIN 또는 대상의 현재 팀 LEADER만 가능. */
    async changeCohort(actorId: number, input: { memberId: number; newCohortId: number; reason: string }) {
      const reason = validateReason(input.reason);
      await db.transaction(async (tx) => {
        const actor = await lockMember(tx, actorId);
        const target = actorId === input.memberId ? actor : await lockMember(tx, input.memberId);
        const access = accessOf(actor);
        if (!access.canManageGlobal() && !access.canManageTeam(target.teamId)) {
          throw new MemberManagementForbiddenError();
        }
        validateCohortChange(target.cohortId, input.newCohortId);
        await assertAssignableCohort(tx, input.newCohortId);
        const at = now();
        await tx.update(member).set({ cohortId: input.newCohortId }).where(eq(member.id, target.id));
        await writeHistory(tx, {
          memberId: target.id,
          field: "COHORT",
          oldValue: String(target.cohortId),
          newValue: String(input.newCohortId),
          reason,
          actorId,
          at,
        });
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_COHORT_CHANGED",
          targetType: "MEMBER",
          targetId: target.id,
          summary: "멤버 기수 변경",
          occurredAt: at,
        });
      });
    },

    async changeRole(actorId: number, input: { memberId: number; newRole: Role; reason: string }) {
      const reason = validateReason(input.reason);
      await db.transaction(async (tx) => {
        await requireActiveAdmin(tx, actorId);
        const target = await lockMember(tx, input.memberId);
        validateRoleChange({ memberId: target.id, role: target.role as Role }, input.newRole, actorId);
        if (target.role === "ADMIN" && target.status === "ACTIVE" && input.newRole !== "ADMIN") {
          await assertAnotherActiveAdminRemains(tx, target.id);
        }
        const at = now();
        await tx.update(member).set({ role: input.newRole }).where(eq(member.id, target.id));
        await writeHistory(tx, {
          memberId: target.id,
          field: "ROLE",
          oldValue: target.role,
          newValue: input.newRole,
          reason,
          actorId,
          at,
        });
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_ROLE_CHANGED",
          targetType: "MEMBER",
          targetId: target.id,
          summary: "멤버 권한 변경",
          occurredAt: at,
        });
        logger.info("멤버 권한 변경", { memberId: target.id, newRole: input.newRole, actorMemberId: actorId });
      });
      await deps.revokeSessions?.(input.memberId);
    },

    async changeStatus(actorId: number, input: { memberId: number; newStatus: MemberStatus; reason: string }) {
      const reason = validateReason(input.reason);
      await db.transaction(async (tx) => {
        await requireActiveAdmin(tx, actorId);
        const target = await lockMember(tx, input.memberId);
        validateStatusChange(target.status as MemberStatus, input.newStatus);
        if (target.role === "ADMIN" && target.status === "ACTIVE" && input.newStatus !== "ACTIVE") {
          await assertAnotherActiveAdminRemains(tx, target.id);
        }
        const at = now();
        await tx.update(member).set({ status: input.newStatus }).where(eq(member.id, target.id));
        await writeHistory(tx, {
          memberId: target.id,
          field: "STATUS",
          oldValue: target.status,
          newValue: input.newStatus,
          reason,
          actorId,
          at,
        });
        await recordAudit(tx, {
          actorMemberId: actorId,
          action: "MEMBER_STATUS_CHANGED",
          targetType: "MEMBER",
          targetId: target.id,
          summary: "멤버 상태 변경",
          occurredAt: at,
        });
        logger.info("멤버 상태 변경", { memberId: target.id, newStatus: input.newStatus, actorMemberId: actorId });
      });
      await deps.revokeSessions?.(input.memberId);
    },

    /** 전체 멤버 목록(ADMIN 전용). 휴대폰 번호는 포함한다. */
    async searchMembers(actorId: number, filter: MemberListFilter = {}) {
      await requireActiveAdmin(db, actorId);
      const page = Math.max(1, filter.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
      const keyword = filter.keyword?.trim();
      const where = and(
        filter.teamId ? eq(member.teamId, filter.teamId) : undefined,
        filter.status ? eq(member.status, filter.status) : undefined,
        filter.role ? eq(member.role, filter.role) : undefined,
        keyword
          ? or(ilike(member.name, `%${escapeLike(keyword)}%`), ilike(member.studentNo, `%${escapeLike(keyword)}%`))
          : undefined,
      );
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(member).where(where);
      const items = await db
        .select()
        .from(member)
        .where(where)
        .orderBy(asc(member.teamId), koSort(member.name), asc(member.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return { total, page, pageSize, items: items.map((row) => toMemberView(row, true)) };
    },

    /** LEADER가 자기 팀의 멤버를 보는 목록. */
    async searchTeamMembers(actorId: number) {
      const [actor] = await db.select().from(member).where(eq(member.id, actorId));
      if (!actor) {
        throw new MemberNotFoundError();
      }
      const access = accessOf(actor);
      if (!access.active || !access.leader) {
        throw new MemberManagementForbiddenError();
      }
      const rows = await db
        .select()
        .from(member)
        .where(and(eq(member.teamId, actor.teamId), eq(member.status, "ACTIVE")))
        .orderBy(koSort(member.name), asc(member.id));
      return rows.map((row) => toMemberView(row, true));
    },

    /** 본인 프로필. 휴대폰 번호는 본인에게만(그리고 ADMIN·팀 LEADER) 노출한다. */
    async lookupProfile(memberId: number) {
      const [row] = await db.select().from(member).where(eq(member.id, memberId));
      if (!row) {
        throw new MemberNotFoundError();
      }
      return toMemberView(row, true);
    },

    async lookupMemberForManager(actorId: number, memberId: number) {
      const [actor] = await db.select().from(member).where(eq(member.id, actorId));
      const [target] = await db.select().from(member).where(eq(member.id, memberId));
      if (!actor || !target) {
        throw new MemberNotFoundError();
      }
      if (!accessOf(actor).canManageTeam(target.teamId)) {
        throw new MemberManagementForbiddenError();
      }
      return toMemberView(target, true);
    },

    async searchHistories(actorId: number, memberId: number) {
      const [actor] = await db.select().from(member).where(eq(member.id, actorId));
      const [target] = await db.select().from(member).where(eq(member.id, memberId));
      if (!actor || !target) {
        throw new MemberNotFoundError();
      }
      if (!accessOf(actor).canManageTeam(target.teamId)) {
        throw new MemberManagementForbiddenError();
      }
      return db
        .select()
        .from(memberChangeHistory)
        .where(eq(memberChangeHistory.memberId, memberId))
        .orderBy(desc(memberChangeHistory.changedAt), desc(memberChangeHistory.id));
    },
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface MemberView {
  id: number;
  studentNo: string;
  name: string;
  department: string | null;
  phoneNumber: string | null;
  teamId: number;
  cohortId: number;
  role: Role;
  status: MemberStatus;
  ssoLinkStatus: string;
  lastLoginAt: Date | null;
  profilePhotoFileId: number | null;
}

function toMemberView(row: typeof member.$inferSelect, includePhone: boolean): MemberView {
  return {
    id: row.id,
    studentNo: row.studentNo,
    name: row.name,
    department: row.department,
    phoneNumber: includePhone ? row.phoneNumber : null,
    teamId: row.teamId,
    cohortId: row.cohortId,
    role: row.role as Role,
    status: row.status as MemberStatus,
    ssoLinkStatus: row.ssoLinkStatus,
    lastLoginAt: row.lastLoginAt,
    profilePhotoFileId: row.profilePhotoFileId,
  };
}
