"use client";

import { useActionState, type ReactNode } from "react";
import { buttonClass } from "@/components/bandi/button";
import { submitKeepingValues } from "@/components/bandi/keep-values";
import type { ActionState } from "@/lib/action-result";

const initial: ActionState = { ok: false, message: null };

// 원본 formField.tag의 입력 스타일. 높이는 min-h-11이라 textarea에도 그대로 쓴다.
export const inputClass =
  "min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3.5 block text-sm">
      <span className="mb-1.5 block text-xs font-extrabold text-muted-foreground">{label}</span>
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
      role="status"
      className={`rounded-md border px-3 py-2.5 text-sm ${state.ok ? "border-success bg-success-soft text-success" : "border-destructive bg-destructive-soft text-destructive"}`}
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
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className={className}>
      {children}
      <Notice state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary")}
      >
        {pending ? "처리 중…" : submitLabel}
      </button>
    </form>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      {title ? (
        <header className="border-b px-5 py-4">
          <h2 className="text-sm font-extrabold">{title}</h2>
        </header>
      ) : null}
      <div className="space-y-3 p-5">{children}</div>
    </section>
  );
}
