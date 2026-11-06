"use client";

import { ActionForm, Field, inputClass } from "@/components/ui";
import { submitActivityAction } from "@/features/activity/actions";

export function SubmitForm({ recordId }: { recordId: number }) {
  return (
    <ActionForm action={submitActivityAction} submitLabel="검수 요청">
      <input type="hidden" name="recordId" value={recordId} />
      <Field label="변경 사유 (선택)">
        <input name="changeReason" maxLength={500} className={inputClass} />
      </Field>
    </ActionForm>
  );
}
