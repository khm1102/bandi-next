import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { storedFile } from "@/features/file/schema";
import {
  ACADEMIC_STATUSES,
  MEMBER_CHANGE_FIELDS,
  MEMBER_STATUSES,
  OFFICER_POSITIONS,
  ROLES,
  SSO_LINK_STATUSES,
} from "./codes";

export const team = pgTable(
  "team",
  {
    id: pk(),
    name: varchar("name", { length: 50 }).notNull(),
    displayOrder: integer("display_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_team_name").on(t.name),
    index("idx_team_active_order").on(t.isActive, t.displayOrder),
  ],
);

/** 기수는 이름만 가진 기준정보. 삭제·비활성화 없이 추가만 한다. */
export const cohort = pgTable(
  "cohort",
  {
    id: pk(),
    name: varchar("name", { length: 30 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uk_cohort_name").on(t.name)],
);

export const member = pgTable(
  "member",
  {
    id: pk(),
    studentNo: varchar("student_no", { length: 20 }).notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    department: varchar("department", { length: 100 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
    academicStatus: varchar("academic_status", { length: 30 }),
    academicStatusVerifiedAt: ts("academic_status_verified_at"),
    teamId: fkCol("team_id")
      .notNull()
      .references(() => team.id),
    cohortId: fkCol("cohort_id")
      .notNull()
      .references(() => cohort.id),
    role: varchar("role", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    ssoLinkStatus: varchar("sso_link_status", { length: 30 }).notNull(),
    ssoLinkedAt: ts("sso_linked_at"),
    lastLoginAt: ts("last_login_at"),
    registeredByMemberId: fkCol("registered_by_member_id").references((): AnyPgColumn => member.id),
    profilePhotoFileId: fkCol("profile_photo_file_id").references(
      (): AnyPgColumn => storedFile.id,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_member_student_no").on(t.studentNo),
    index("idx_member_team_status").on(t.teamId, t.status),
    index("idx_member_cohort_status").on(t.cohortId, t.status),
    index("idx_member_registered_by").on(t.registeredByMemberId),
    index("idx_member_profile_photo").on(t.profilePhotoFileId),
    check("ck_member_role", inList(t.role, ROLES)),
    check("ck_member_status", inList(t.status, MEMBER_STATUSES)),
    check("ck_member_sso_link_status", inList(t.ssoLinkStatus, SSO_LINK_STATUSES)),
    check(
      "ck_member_academic_status",
      sql`${t.academicStatus} is null or ${inList(t.academicStatus, ACADEMIC_STATUSES)}`,
    ),
  ],
);

/**
 * 팀·기수·역할·상태 변경 이력 (MySQL의 4개 이력 테이블 통합).
 * old_value/new_value는 팀·기수는 ID 문자열, 역할·상태는 코드 문자열.
 */
export const memberChangeHistory = pgTable(
  "member_change_history",
  {
    id: pk(),
    memberId: fkCol("member_id")
      .notNull()
      .references(() => member.id),
    field: varchar("field", { length: 20 }).notNull(),
    oldValue: varchar("old_value", { length: 50 }).notNull(),
    newValue: varchar("new_value", { length: 50 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    changedByMemberId: fkCol("changed_by_member_id")
      .notNull()
      .references(() => member.id),
    changedAt: ts("changed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_member_change_member_field_changed").on(t.memberId, t.field, t.changedAt),
    index("idx_member_change_changed_by").on(t.changedByMemberId),
    check("ck_member_change_field", inList(t.field, MEMBER_CHANGE_FIELDS)),
  ],
);

/** 권한과 독립된 동아리 직책 (현재는 회장 1명). */
export const clubOfficer = pgTable(
  "club_officer",
  {
    id: pk(),
    position: varchar("position", { length: 30 }).notNull(),
    memberId: fkCol("member_id")
      .notNull()
      .references(() => member.id),
    appointedAt: ts("appointed_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_club_officer_position").on(t.position),
    index("idx_club_officer_member").on(t.memberId),
    check("ck_club_officer_position", inList(t.position, OFFICER_POSITIONS)),
  ],
);

/** 학교 포털 자격증명 실패 제한. 학번 원문 대신 HMAC-SHA-256 해시만 저장한다. */
export const schoolLoginAttempt = pgTable(
  "school_login_attempt",
  {
    id: pk(),
    studentNoHash: char("student_no_hash", { length: 64 }).notNull(),
    failureCount: integer("failure_count").notNull().default(0),
    firstFailureAt: ts("first_failure_at"),
    blockedUntil: ts("blocked_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_school_login_attempt_hash").on(t.studentNoHash),
    check("ck_school_login_attempt_count", sql`${t.failureCount} >= 0`),
  ],
);

/** 불투명 세션 토큰의 SHA-256 해시만 저장한다 (원문 토큰은 쿠키에만 존재). */
export const session = pgTable(
  "session",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    memberId: fkCol("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_session_member").on(t.memberId), index("idx_session_expires").on(t.expiresAt)],
);
