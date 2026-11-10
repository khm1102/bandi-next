"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/bandi/button";
import { Icon } from "@/components/bandi/icons";
import { Notice } from "@/components/ui";
import { submitKeepingValues } from "@/components/bandi/keep-values";
import type { ActionState } from "@/lib/action-result";

const initial: ActionState = { ok: false, message: null };

/** 원본 modal.tag: 백드롭 + 중앙 패널(헤더/본문/푸터). Esc·백드롭 클릭으로 닫고 포커스를 패널로 옮긴다. */
export function Modal({ open, onClose, title, description, size = "md", mobileFullscreen = false, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  mobileFullscreen?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="bandi-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-sidebar/50 backdrop-blur-sm" data-mobile-fullscreen={mobileFullscreen} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className="bandi-modal-panel max-h-full w-full overflow-y-auto overscroll-contain bg-card shadow-xl" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} data-modal-size={size} tabIndex={-1}>
        <header className="flex items-start gap-3 border-b px-6 py-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-extrabold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="닫기">
            <Icon name="x" className="size-5" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** 버튼을 누르면 서버 액션 폼이 들어 있는 모달을 연다. 성공하면 닫힌다. */
export function ModalFormLauncher({ label, variant = "primary", title, description, submitLabel, action, children }: {
  label: string;
  variant?: "primary" | "outline";
  title: string;
  description?: string;
  submitLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initial);
  const formId = useId();
  const [lastOk, setLastOk] = useState<ActionState | null>(null);
  if (state.ok && state !== lastOk) {
    setLastOk(state);
    setOpen(false);
  }
  return (
    <>
      <button type="button" className={buttonClass(variant)} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        footer={
          <>
            <button type="button" className={buttonClass("outline")} onClick={() => setOpen(false)}>취소</button>
            <button type="submit" form={formId} disabled={pending} className={buttonClass("primary")}>{pending ? "처리 중…" : submitLabel}</button>
          </>
        }
      >
        <form id={formId} action={formAction} onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-3">
          {children}
          <Notice state={state} />
        </form>
      </Modal>
    </>
  );
}
