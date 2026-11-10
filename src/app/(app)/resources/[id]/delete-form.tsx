"use client";

import { ConfirmForm } from "@/components/bandi/confirm-form";
import { deleteResourceAction } from "@/features/resource/actions";

export function DeleteResourceForm({ resourceId }: { resourceId: number }) {
  return (
    <ConfirmForm action={deleteResourceAction} confirmMessage="이 자료를 삭제하면 목록과 상세, 첨부 다운로드에서 숨겨집니다." label="자료 삭제">
      <input type="hidden" name="resourceId" value={resourceId} />
    </ConfirmForm>
  );
}
