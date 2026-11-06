"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-result";

const idle: ActionState = { ok: false, message: null };
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * 인증 URL 복사 + (권한이 있으면) 제목 공개 링크 발급·중단.
 * 발급 액션은 성공 시 `/share/...` 경로를 message로 돌려준다.
 */
export function ShareControls(props: {
  idField: string;
  id: number;
  ownPath: string;
  canIssue: boolean;
  shared: boolean;
  issueAction: Action;
  revokeAction: Action;
}) {
  const [issued, issue, issuing] = useActionState(props.issueAction, idle);
  const [revoked, revoke, revoking] = useActionState(props.revokeAction, idle);
  const [copied, setCopied] = useState(false);
  const link = issued.ok && issued.message ? `${window.location.origin}${issued.message}` : null;
  return (
    <section className="space-y-2 text-sm">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}${props.ownPath}`);
          setCopied(true);
        }}
      >
        {copied ? "복사됨" : "링크 복사"}
      </button>
      <p className="text-xs text-muted-foreground">로그인한 멤버에게만 열리는 주소입니다.</p>
      {props.canIssue ? (
        <div className="space-y-2">
          <form action={issue}>
            <input type="hidden" name={props.idField} value={props.id} />
            <button disabled={issuing} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
              제목 공개 링크 {props.shared ? "다시 발급" : "발급"}
            </button>
          </form>
          {link ? (
            <p data-testid="share-link" className="break-all rounded bg-secondary p-2">
              {link}
            </p>
          ) : null}
          {issued.message && !issued.ok ? <p className="text-destructive">{issued.message}</p> : null}
          {props.shared ? (
            <form action={revoke}>
              <input type="hidden" name={props.idField} value={props.id} />
              <button disabled={revoking} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
                공개 링크 중단
              </button>
            </form>
          ) : null}
          {revoked.message ? <p data-testid="share-revoked">{revoked.message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
