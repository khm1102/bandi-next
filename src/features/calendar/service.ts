import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db/types";
import { accessFor, type AccessContext } from "@/lib/policy";
import { InvalidTeamError, MemberNotFoundError } from "@/features/member/errors";
import { member, team } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { calendarEvent } from "./schema";
import { CalendarAccessDeniedError, CalendarEventNotFoundError, validateEvent, type EventInput } from "./model";

export interface CalendarServiceDeps {
  db: Db;
  now?: () => Date;
}

export interface EventSearch {
  rangeStart: Date;
  rangeEnd: Date;
  /** 지정하면 해당 팀 일정 + 동아리 전체 일정만 조회한다. */
  teamId?: number;
}

export interface EventView {
  id: number;
  teamId: number | null;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  place: string | null;
  color: string;
  updatedAt: Date;
}

const toView = (row: typeof calendarEvent.$inferSelect): EventView => ({
  id: row.id,
  teamId: row.teamId,
  title: row.title,
  description: row.description,
  startAt: row.startAt,
  endAt: row.endAt,
  isAllDay: row.isAllDay,
  place: row.place,
  color: row.color,
  updatedAt: row.updatedAt,
});

export function createCalendarService(deps: CalendarServiceDeps) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  async function access(actorId: number): Promise<AccessContext> {
    const [row] = await db.select().from(member).where(eq(member.id, actorId));
    if (!row) {
      throw new MemberNotFoundError();
    }
    return accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
  }

  /** teamId가 null(전체 일정)이면 ADMIN, 팀 일정이면 해당 팀 LEADER 또는 ADMIN. */
  function assertCanManage(context: AccessContext, targetTeamId: number | null): void {
    const allowed = targetTeamId === null ? context.canManageGlobal() : context.canManageTeam(targetTeamId);
    if (!allowed) {
      throw new CalendarAccessDeniedError();
    }
  }

  async function assertActiveTeam(teamId: number | null): Promise<void> {
    if (teamId === null) return;
    const [row] = await db.select().from(team).where(and(eq(team.id, teamId), eq(team.isActive, true)));
    if (!row) throw new InvalidTeamError();
  }

  return {
    async search(actorId: number, search: EventSearch): Promise<EventView[]> {
      const context = await access(actorId);
      if (!context.canReadInternal()) {
        throw new CalendarAccessDeniedError();
      }
      const rows = await db
        .select()
        .from(calendarEvent)
        .where(
          and(
            isNull(calendarEvent.deletedAt),
            lt(calendarEvent.startAt, search.rangeEnd),
            gt(calendarEvent.endAt, search.rangeStart),
            search.teamId ? or(eq(calendarEvent.teamId, search.teamId), isNull(calendarEvent.teamId)) : undefined,
          ),
        )
        .orderBy(asc(calendarEvent.startAt), asc(calendarEvent.id));
      return rows.map(toView);
    },

    async lookup(actorId: number, eventId: number): Promise<EventView> {
      const context = await access(actorId);
      if (!context.canReadInternal()) {
        throw new CalendarAccessDeniedError();
      }
      const [row] = await db.select().from(calendarEvent).where(and(eq(calendarEvent.id, eventId), isNull(calendarEvent.deletedAt)));
      if (!row) throw new CalendarEventNotFoundError();
      return toView(row);
    },

    async create(actorId: number, input: EventInput): Promise<number> {
      const context = await access(actorId);
      assertCanManage(context, input.teamId);
      await assertActiveTeam(input.teamId);
      const valid = validateEvent(input);
      const [created] = await db
        .insert(calendarEvent)
        .values({ ...valid, createdByMemberId: actorId, updatedByMemberId: actorId })
        .returning({ id: calendarEvent.id });
      return created.id;
    },

    /** 수정: 기존 일정과 변경 후 범위 모두에 대한 관리 권한이 필요하다 (타팀으로 옮기기 방지). */
    async update(actorId: number, eventId: number, input: EventInput): Promise<void> {
      await db.transaction(async (tx) => {
        const [actor] = await tx.select().from(member).where(eq(member.id, actorId));
        if (!actor) throw new MemberNotFoundError();
        const context = accessFor({ memberId: actor.id, teamId: actor.teamId, role: actor.role as Role, status: actor.status as MemberStatus });
        if (!context.canReadInternal()) throw new CalendarAccessDeniedError();
        const [original] = await tx
          .select()
          .from(calendarEvent)
          .where(and(eq(calendarEvent.id, eventId), isNull(calendarEvent.deletedAt)))
          .for("update");
        if (!original) throw new CalendarEventNotFoundError();
        assertCanManage(context, original.teamId);
        assertCanManage(context, input.teamId);
        await assertActiveTeam(input.teamId);
        const valid = validateEvent(input, original.color as never);
        await tx
          .update(calendarEvent)
          .set({ ...valid, updatedByMemberId: actorId })
          .where(eq(calendarEvent.id, eventId));
      });
    },

    async delete(actorId: number, eventId: number): Promise<void> {
      await db.transaction(async (tx) => {
        const [actor] = await tx.select().from(member).where(eq(member.id, actorId));
        if (!actor) throw new MemberNotFoundError();
        const context = accessFor({ memberId: actor.id, teamId: actor.teamId, role: actor.role as Role, status: actor.status as MemberStatus });
        if (!context.canReadInternal()) throw new CalendarAccessDeniedError();
        const [original] = await tx
          .select()
          .from(calendarEvent)
          .where(and(eq(calendarEvent.id, eventId), isNull(calendarEvent.deletedAt)))
          .for("update");
        if (!original) throw new CalendarEventNotFoundError();
        assertCanManage(context, original.teamId);
        await tx
          .update(calendarEvent)
          .set({ deletedAt: now(), updatedByMemberId: actorId })
          .where(eq(calendarEvent.id, eventId));
      });
    },

    /** 홈 요약용: 지금 이후 가장 가까운 일정. */
    async upcoming(actorId: number, limit = 5): Promise<EventView[]> {
      const context = await access(actorId);
      if (!context.canReadInternal()) throw new CalendarAccessDeniedError();
      const rows = await db
        .select()
        .from(calendarEvent)
        .where(and(isNull(calendarEvent.deletedAt), gt(calendarEvent.endAt, now())))
        .orderBy(asc(calendarEvent.startAt))
        .limit(limit);
      return rows.map(toView);
    },
  };
}

