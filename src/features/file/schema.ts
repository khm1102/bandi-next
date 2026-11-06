import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { member } from "@/features/member/schema";
import {
  FILE_PURPOSES,
  RETIREMENT_REASONS,
  RETIREMENT_STATUSES,
  STORAGE_SCOPES,
  UPLOAD_STATUSES,
} from "./codes";

/** 파일 바이너리는 로컬 볼륨, DB에는 메타데이터만 둔다. */
export const storedFile = pgTable(
  "stored_file",
  {
    id: pk(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storageScope: varchar("storage_scope", { length: 20 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    uploadStatus: varchar("upload_status", { length: 20 }).notNull(),
    purpose: varchar("purpose", { length: 30 }).notNull().default("GENERAL"),
    uploadedByMemberId: fkCol("uploaded_by_member_id").references(() => member.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("uk_stored_file_scope_key").on(t.storageScope, t.storageKey),
    index("idx_stored_file_hash_size").on(t.sha256, t.sizeBytes),
    index("idx_stored_file_uploader_created").on(t.uploadedByMemberId, t.createdAt),
    index("idx_stored_file_status_created").on(t.uploadStatus, t.createdAt),
    check("ck_stored_file_scope", inList(t.storageScope, STORAGE_SCOPES)),
    check("ck_stored_file_status", inList(t.uploadStatus, UPLOAD_STATUSES)),
    check("ck_stored_file_purpose", inList(t.purpose, FILE_PURPOSES)),
    check("ck_stored_file_size", sql`${t.sizeBytes} > 0`),
    check("ck_stored_file_sha256", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** 교체·삭제·미사용으로 파기해야 하는 파일의 재시도 가능한 대기열 (MySQL manifest 2종 통합). */
export const fileRetirementQueue = pgTable(
  "file_retirement_queue",
  {
    id: pk(),
    // FK를 두지 않는다: 파기 완료 시 stored_file 메타데이터를 하드 삭제하고 큐 행만 남긴다.
    storedFileId: fkCol("stored_file_id").notNull(),
    reason: varchar("reason", { length: 30 }).notNull(),
    storageScope: varchar("storage_scope", { length: 20 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    failureReason: text("failure_reason"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_file_retirement_file").on(t.storedFileId),
    index("idx_file_retirement_status_created").on(t.status, t.createdAt),
    check("ck_file_retirement_reason", inList(t.reason, RETIREMENT_REASONS)),
    check("ck_file_retirement_status", inList(t.status, RETIREMENT_STATUSES)),
    check("ck_file_retirement_scope", inList(t.storageScope, STORAGE_SCOPES)),
    check("ck_file_retirement_attempt", sql`${t.attemptCount} >= 0`),
  ],
);
