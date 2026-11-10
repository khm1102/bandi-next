"use client";

import { useActionState, type ReactNode } from "react";
import { buttonClass } from "@/components/bandi/button";
import { Notice } from "@/components/ui";
import { submitKeepingValues } from "@/components/bandi/keep-values";
import type { ActionState } from "@/lib/action-result";
import Link from "next/link";

const initial: ActionState = { ok: false, message: null };

/** 원본 작성 화면의 폼 골격: max-w-5xl 본문 + 하단 고정 취소/저장 바. */
export function EditorForm({
  action,
  cancelHref,
  submitLabel,
  secondarySubmit,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  cancelHref: string;
  submitLabel: string;
  /** 기본 저장과 다른 의도로 제출하는 보조 버튼 (예: 저장 후 게시). 기본 버튼이 오른쪽 주 버튼이 된다. */
  secondarySubmit?: { label: string; value: string };
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="mx-auto max-w-5xl space-y-7">
      {children}
      <Notice state={state} />
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 py-4 backdrop-blur">
        <Link href={cancelHref} className={buttonClass("outline")}>취소</Link>
        {secondarySubmit ? (
          <button type="submit" name="intent" value="draft" disabled={pending} className={buttonClass("outline")}>
            {pending ? "처리 중…" : submitLabel}
          </button>
        ) : null}
        <button type="submit" name={secondarySubmit ? "intent" : undefined} value={secondarySubmit?.value} disabled={pending} className={buttonClass("primary")}>
          {pending ? "처리 중…" : (secondarySubmit?.label ?? submitLabel)}
        </button>
      </div>
    </form>
  );
}

export const TITLE_INPUT =
  "h-12 w-full rounded-md border border-input bg-card px-4 text-base placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20";
