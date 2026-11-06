import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { storedFile } from "@/features/file/schema";
import { member, team } from "@/features/member/schema";

export const ACTIVITY_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "TEAM_APPROVED",
  "APPROVED",
  "REVISION_REQUESTED",
  "ARCHIVED",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_FILE_ROLES = ["EVIDENCE", "ADDITIONAL", "DOCUMENT"] as const;
export type ActivityFileRole = (typeof ACTIVITY_FILE_ROLES)[number];

export interface ReportParticipant {
  name: string;
  department: string | null;
  studentNo: string | null;
  note: string | null;
}

export const activityRecord = pgTable(
  "activity_record",
  {
    id: pk(),
    teamId: fkCol("team_id")
      .notNull()
      .references(() => team.id),
    activityAt: ts("activity_at").notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    body: text("body").notNull(),
    participantCount: integer("participant_count").notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    createdByMemberId: fkCol("created_by_member_id")
      .notNull()
      .references(() => member.id),
    updatedByMemberId: fkCol("updated_by_member_id")
      .notNull()
      .references(() => member.id),
    submittedAt: ts("submitted_at"),
    reviewedAt: ts("reviewed_at"),
    reviewedByMemberId: fkCol("reviewed_by_member_id").references(() => member.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("idx_activity_record_team_status_date").on(t.teamId, t.status, t.activityAt),
    index("idx_activity_record_creator_status").on(t.createdByMemberId, t.status, t.updatedAt),
    index("idx_activity_record_status_updated").on(t.status, t.updatedAt),
    check("ck_activity_record_status", inList(t.status, ACTIVITY_STATUSES)),
    check("ck_activity_record_participants", sql`${t.participantCount} > 0`),
    check(
      "ck_activity_record_status_times",
      sql`(
        (${t.status} = 'DRAFT' and ${t.submittedAt} is null and ${t.reviewedAt} is null and ${t.reviewedByMemberId} is null)
        or (${t.status} = 'SUBMITTED' and ${t.submittedAt} is not null and ${t.reviewedAt} is null and ${t.reviewedByMemberId} is null)
        or (${t.status} in ('TEAM_APPROVED', 'APPROVED', 'REVISION_REQUESTED') and ${t.submittedAt} is not null and ${t.reviewedAt} is not null and ${t.reviewedByMemberId} is not null)
        or ${t.status} = 'ARCHIVED'
      )`,
    ),
  ],
);

export const activityRecordFile = pgTable(
  "activity_record_file",
  {
    id: pk(),
    activityRecordId: fkCol("activity_record_id")
      .notNull()
      .references(() => activityRecord.id),
    storedFileId: fkCol("stored_file_id")
      .notNull()
      .references(() => storedFile.id),
    fileRole: varchar("file_role", { length: 20 }).notNull(),
    displayOrder: integer("display_order").notNull(),
    uploadedByMemberId: fkCol("uploaded_by_member_id")
      .notNull()
      .references(() => member.id),
    replacedByFileId: fkCol("replaced_by_file_id").references(
      (): AnyPgColumn => activityRecordFile.id,
    ),
    replacedAt: ts("replaced_at"),
    replacedByMemberId: fkCol("replaced_by_member_id").references(() => member.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_activity_record_file_current").on(t.activityRecordId, t.fileRole, t.replacedAt),
    index("idx_activity_record_file_stored").on(t.storedFileId),
    check("ck_activity_record_file_role", inList(t.fileRole, ACTIVITY_FILE_ROLES)),
    check("ck_activity_record_file_order", sql`${t.displayOrder} >= 0`),
    check(
      "ck_activity_record_file_replaced",
      sql`(${t.replacedByFileId} is null and ${t.replacedAt} is null and ${t.replacedByMemberId} is null) or (${t.replacedByFileId} is not null and ${t.replacedAt} is not null and ${t.replacedByMemberId} is not null)`,
    ),
  ],
);

export const activityRecordRevision = pgTable(
  "activity_record_revision",
  {
    id: pk(),
    activityRecordId: fkCol("activity_record_id")
      .notNull()
      .references(() => activityRecord.id),
    revisionNo: integer("revision_no").notNull(),
    activityAt: ts("activity_at").notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    body: text("body").notNull(),
    participantCount: integer("participant_count").notNull(),
    changedByMemberId: fkCol("changed_by_member_id")
      .notNull()
      .references(() => member.id),
    changedAt: ts("changed_at").notNull(),
    changeReason: varchar("change_reason", { length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uk_activity_record_revision").on(t.activityRecordId, t.revisionNo),
    check("ck_activity_record_revision_no", sql`${t.revisionNo} > 0`),
    check("ck_activity_record_revision_participants", sql`${t.participantCount} > 0`),
  ],
);

export const activityReviewHistory = pgTable(
  "activity_review_history",
  {
    id: pk(),
    activityRecordId: fkCol("activity_record_id")
      .notNull()
      .references(() => activityRecord.id),
    previousStatus: varchar("previous_status", { length: 30 }).notNull(),
    newStatus: varchar("new_status", { length: 30 }).notNull(),
    comment: text("comment"),
    reviewedByMemberId: fkCol("reviewed_by_member_id")
      .notNull()
      .references(() => member.id),
    reviewedAt: ts("reviewed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_activity_review_history_record").on(t.activityRecordId, t.reviewedAt),
    check("ck_activity_review_previous", inList(t.previousStatus, ACTIVITY_STATUSES)),
    check("ck_activity_review_new", inList(t.newStatus, ACTIVITY_STATUSES)),
    check("ck_activity_review_change", sql`${t.previousStatus} <> ${t.newStatus}`),
    check(
      "ck_activity_review_comment",
      sql`${t.newStatus} <> 'REVISION_REQUESTED' or ${t.comment} is not null`,
    ),
  ],
);

/** HWPX 활동 내역서 입력 스냅샷. 참여자 1~14명은 jsonb로 보관한다 (MySQL 별도 테이블 통합). */
export const activityReportDocument = pgTable(
  "activity_report_document",
  {
    id: pk(),
    activityRecordId: fkCol("activity_record_id")
      .notNull()
      .references(() => activityRecord.id),
    representative: varchar("representative", { length: 20 }).notNull(),
    location: varchar("location", { length: 50 }).notNull(),
    participants: jsonb("participants").$type<ReportParticipant[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_activity_report_document_record").on(t.activityRecordId),
    check(
      "ck_activity_report_participants",
      sql`jsonb_typeof(${t.participants}) = 'array' and jsonb_array_length(${t.participants}) between 1 and 14`,
    ),
  ],
);
