"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-result";

const initial: ActionState = { ok: false, message: null };

export const inputClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-extrabold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }
  return (
    <p
      data-testid="action-message"
      className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

/** 서버 액션 폼: 제출 중 비활성화, 결과 메시지를 표시한다. 모든 변경은 서버에서 다시 검증된다. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-3",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className={className}>
      {children}
      <Notice state={state} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-60"
      >
        {pending ? "처리 중…" : submitLabel}
      </button>
    </form>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      {title ? <h2 className="text-sm font-extrabold">{title}</h2> : null}
      {children}
    </section>
  );
}
