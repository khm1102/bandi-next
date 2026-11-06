"use client";

import { ActionForm } from "@/components/ui";
import { submitReportAction } from "@/features/activity/actions";

export function SubmitReportForm({ recordId }: { recordId: number }) {
  return (
    <ActionForm action={submitReportAction} submitLabel="검수 요청" className="space-y-2">
      <input type="hidden" name="recordId" value={recordId} />
      <p className="text-sm text-muted-foreground">검수를 요청하면 팀장 승인 전까지 수정할 수 없습니다.</p>
    </ActionForm>
  );
}
