"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-result";

const initial: ActionState = { ok: false, message: null };

/** 확인(confirm) 후 서버 액션을 제출하는 위험 동작 버튼 (원본 data-confirm 대응). 서버가 권한을 다시 검사한다. */
export function ConfirmForm({
  action,
  confirmMessage,
  label,
  className = "inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-bold text-destructive hover:bg-destructive-soft",
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  confirmMessage: string;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      {children}
      <button type="submit" disabled={pending} className={className}>
        {label}
      </button>
      {state.message ? (
        <span role={state.ok ? "status" : "alert"} data-testid="action-message" className={`text-xs font-bold ${state.ok ? "text-success" : "text-destructive"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
