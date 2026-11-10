"use client";

import { ActionForm, Field, inputClass } from "@/components/ui";
import { archiveActivityAction, finalApproveAction, requestRevisionAction, teamApproveAction } from "@/features/activity/actions";

/** 원본 review-detail의 검수 처리 패널. 서버가 단계·권한을 다시 검사한다. */
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
    <section className="mt-6 rounded-lg border bg-secondary/50 p-4">
      <h3 className="text-sm font-extrabold">검수 처리</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">현재 단계에서 가능한 처리만 표시돼요. 처리 내용은 검수 이력에 남아요.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
            <Field label="보완 사유 (필수)">
              <textarea name="comment" required maxLength={500} className={`${inputClass} min-h-28 resize-y`} />
            </Field>
          </ActionForm>
        ) : null}
        {can.archive ? (
          <ActionForm action={archiveActivityAction} submitLabel="보관">
            {hidden}
          </ActionForm>
        ) : null}
      </div>
    </section>
  );
}
