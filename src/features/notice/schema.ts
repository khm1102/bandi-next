import { boolean, check, index, integer, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { storedFile } from "@/features/file/schema";
import { member, team } from "@/features/member/schema";

export const NOTICE_SCOPES = ["ALL", "TEAM"] as const;
export type NoticeScope = (typeof NOTICE_SCOPES)[number];

export const NOTICE_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "CLOSED", "ARCHIVED"] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export const internalNotice = pgTable(
  "internal_notice",
  {
    id: pk(),
    targetScope: varchar("target_scope", { length: 20 }).notNull(),
    teamId: fkCol("team_id").references(() => team.id),
    title: varchar("title", { length: 200 }).notNull(),
    /** GFM Markdown 원문. 렌더된 HTML은 저장하지 않는다. */
    body: text("body").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    isImportant: boolean("is_important").notNull().default(false),
    publishStartAt: ts("publish_start_at"),
    publishEndAt: ts("publish_end_at"),
    createdByMemberId: fkCol("created_by_member_id")
      .notNull()
      .references(() => member.id),
    updatedByMemberId: fkCol("updated_by_member_id")
      .notNull()
      .references(() => member.id),
    publishedByMemberId: fkCol("published_by_member_id").references(() => member.id),
    /** 256비트 난수 Base64URL(43자). NULL이면 공유 중단. */
    shareToken: varchar("share_token", { length: 43 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("uk_internal_notice_share_token").on(t.shareToken),
    index("idx_internal_notice_scope_publish").on(
      t.targetScope,
      t.teamId,
      t.status,
      t.publishStartAt,
    ),
    index("idx_internal_notice_visible_order")
      .on(t.status, t.isImportant, t.publishStartAt, t.id)
      .where(sql`${t.deletedAt} is null`),
    index("idx_internal_notice_created_by").on(t.createdByMemberId),
    index("idx_internal_notice_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
    check("ck_internal_notice_scope", inList(t.targetScope, NOTICE_SCOPES)),
    check("ck_internal_notice_status", inList(t.status, NOTICE_STATUSES)),
    check(
      "ck_internal_notice_scope_team",
      sql`(${t.targetScope} = 'ALL' and ${t.teamId} is null) or (${t.targetScope} = 'TEAM' and ${t.teamId} is not null)`,
    ),
    check(
      "ck_internal_notice_publish_period",
      sql`${t.publishStartAt} is null or ${t.publishEndAt} is null or ${t.publishStartAt} <= ${t.publishEndAt}`,
    ),
    check(
      "ck_internal_notice_publish_state",
      sql`${t.status} in ('DRAFT', 'ARCHIVED') or (${t.publishStartAt} is not null and ${t.publishedByMemberId} is not null)`,
    ),
  ],
);

export const internalNoticeAttachment = pgTable(
  "internal_notice_attachment",
  {
    id: pk(),
    internalNoticeId: fkCol("internal_notice_id")
      .notNull()
      .references(() => internalNotice.id),
    storedFileId: fkCol("stored_file_id")
      .notNull()
      .references(() => storedFile.id),
    displayOrder: integer("display_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uk_notice_attachment_notice_file").on(t.internalNoticeId, t.storedFileId),
    uniqueIndex("uk_notice_attachment_notice_order").on(t.internalNoticeId, t.displayOrder),
    index("idx_notice_attachment_file").on(t.storedFileId),
    check("ck_notice_attachment_order", sql`${t.displayOrder} >= 0`),
  ],
);

/** 멤버별 읽음 상태 (조회수 대신). 상세를 열 때 upsert. */
export const internalNoticeRead = pgTable(
  "internal_notice_read",
  {
    id: pk(),
    internalNoticeId: fkCol("internal_notice_id")
      .notNull()
      .references(() => internalNotice.id),
    memberId: fkCol("member_id")
      .notNull()
      .references(() => member.id),
    firstReadAt: ts("first_read_at").notNull(),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [
    uniqueIndex("uk_notice_read_notice_member").on(t.internalNoticeId, t.memberId),
    index("idx_notice_read_member_last").on(t.memberId, t.lastReadAt),
    check("ck_notice_read_period", sql`${t.firstReadAt} <= ${t.lastReadAt}`),
  ],
);
