"use client";

import { ConfirmForm } from "@/components/bandi/confirm-form";
import type { ActionState } from "@/lib/action-result";

export function DeleteEventForm({
  action,
  eventId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  eventId: number;
}) {
  return (
    <ConfirmForm action={action} confirmMessage="이 일정을 삭제할까요?" label="일정 삭제" className="inline-flex min-h-11 items-center justify-center rounded-md bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90">
      <input type="hidden" name="eventId" value={eventId} />
    </ConfirmForm>
  );
}
