"use client";

import { ActionForm } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";

export function DeleteEventForm({
  action,
  eventId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  eventId: number;
}) {
  return (
    <ActionForm action={action} submitLabel="일정 삭제">
      <input type="hidden" name="eventId" value={eventId} />
      <p className="text-sm text-muted-foreground">삭제한 일정은 목록과 캘린더에서 사라집니다.</p>
    </ActionForm>
  );
}
