import { bigint, check, index, jsonb, pgTable, varchar } from "drizzle-orm/pg-core";
import { createdAt, fkCol, inList, pk, ts } from "@/db/columns";
import { member } from "@/features/member/schema";

export const AUDIT_ACTIONS = [
  "MEMBER_TEAM_CHANGED",
  "MEMBER_COHORT_CHANGED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_STATUS_CHANGED",
  "ASSET_DELETED",
  "ASSET_RESTORED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ["MEMBER", "ASSET"] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    actorMemberId: fkCol("actor_member_id").references(() => member.id),
    action: varchar("action", { length: 50 }).notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: bigint("target_id", { mode: "number" }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    detail: jsonb("detail"),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_audit_log_actor").on(t.actorMemberId),
    index("idx_audit_log_target").on(t.targetType, t.targetId, t.occurredAt),
    check("ck_audit_log_action", inList(t.action, AUDIT_ACTIONS)),
    check("ck_audit_log_target_type", inList(t.targetType, AUDIT_TARGET_TYPES)),
  ],
);
