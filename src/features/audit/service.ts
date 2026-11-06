import type { DbOrTx } from "@/db/types";
import { auditLog, type AuditAction, type AuditTargetType } from "./schema";

/** 주요 운영 변경의 처리자·대상·시각을 기록한다. 호출부 트랜잭션에 포함시켜 원자적으로 남긴다. */
export async function recordAudit(
  executor: DbOrTx,
  entry: {
    actorMemberId: number | null;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId: number;
    summary: string;
    detail?: Record<string, unknown>;
    occurredAt: Date;
  },
): Promise<void> {
  await executor.insert(auditLog).values({
    actorMemberId: entry.actorMemberId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    detail: entry.detail ?? null,
    occurredAt: entry.occurredAt,
  });
}
