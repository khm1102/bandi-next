import { boolean, check, index, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { member, team } from "@/features/member/schema";

export const EVENT_COLORS = ["NAVY", "MINT", "BLUE", "PLUM", "AMBER", "ROSE"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

/** team_id가 NULL이면 동아리 전체 일정. 종일 일정의 종료는 마지막 날 다음 날 00:00(배타). */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: pk(),
    teamId: fkCol("team_id").references(() => team.id),
    title: varchar("title", { length: 150 }).notNull(),
    description: text("description"),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    isAllDay: boolean("is_all_day").notNull().default(false),
    place: varchar("place", { length: 200 }),
    color: varchar("color", { length: 20 }).notNull().default("NAVY"),
    createdByMemberId: fkCol("created_by_member_id")
      .notNull()
      .references(() => member.id),
    updatedByMemberId: fkCol("updated_by_member_id")
      .notNull()
      .references(() => member.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("idx_calendar_event_team_start").on(t.teamId, t.startAt),
    index("idx_calendar_event_period")
      .using("gist", sql`tstzrange(${t.startAt}, ${t.endAt})`)
      .where(sql`${t.deletedAt} is null`),
    index("idx_calendar_event_created_by").on(t.createdByMemberId),
    index("idx_calendar_event_updated_by").on(t.updatedByMemberId),
    check("ck_calendar_event_color", inList(t.color, EVENT_COLORS)),
    check("ck_calendar_event_period", sql`${t.endAt} > ${t.startAt}`),
  ],
);
