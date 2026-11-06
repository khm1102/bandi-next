"use client";

import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { archiveActivityAction, finalApproveAction, requestRevisionAction, teamApproveAction } from "@/features/activity/actions";

export function ReviewActions({
  recordId,
  can,
  emergency,
}: {
  recordId: number;
  can: { teamApprove: boolean; finalApprove: boolean; requestRevision: boolean; archive: boolean };
  emergency: boolean;
}) {
  const hidden = <input type="hidden" name="recordId" value={recordId} />;
  if (!can.teamApprove && !can.finalApprove && !can.requestRevision && !can.archive) {
    return null;
  }
  return (
    <Card title="검수">
      <div className="grid gap-4 md:grid-cols-2">
        {can.teamApprove ? (
          <ActionForm action={teamApproveAction} submitLabel="팀장 1차 승인">
            {hidden}
          </ActionForm>
        ) : null}
        {can.finalApprove ? (
          <ActionForm action={finalApproveAction} submitLabel={emergency ? "긴급 최종 승인" : "최종 승인"}>
            {hidden}
            {emergency ? (
              <Field label="긴급 승인 사유 (필수)">
                <input name="emergencyReason" required maxLength={400} className={inputClass} />
              </Field>
            ) : null}
          </ActionForm>
        ) : null}
        {can.requestRevision ? (
          <ActionForm action={requestRevisionAction} submitLabel="보완 요청">
            {hidden}
            <Field label="보완 요청 사유 (필수)">
              <input name="comment" required maxLength={500} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
        {can.archive ? (
          <ActionForm action={archiveActivityAction} submitLabel="보관">
            {hidden}
          </ActionForm>
        ) : null}
      </div>
    </Card>
  );
}
