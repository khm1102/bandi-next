"use client";

import { ActionForm } from "@/components/ui";
import { deleteResourceAction } from "@/features/resource/actions";

export function DeleteResourceForm({ resourceId }: { resourceId: number }) {
  return (
    <ActionForm action={deleteResourceAction} submitLabel="삭제" className="space-y-2">
      <input type="hidden" name="resourceId" value={resourceId} />
    </ActionForm>
  );
}
