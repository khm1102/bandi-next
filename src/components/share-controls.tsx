"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/bandi/icons";
import { buttonClass } from "@/components/bandi/button";
import type { ActionState } from "@/lib/action-result";

const idle: ActionState = { ok: false, message: null };
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

/**
 * 원본 share.js 동작: 공유 버튼 → (발급 권한이 있으면 확인 후 제목 공개 링크 발급) → 공유 시트/클립보드.
 * 발급 액션은 성공 시 `/share/...` 경로를 message로 돌려준다. 서버가 권한을 다시 검사한다.
 */
export function ShareControls(props: {
  idField: string;
  id: number;
  ownPath: string;
  title: string;
  canIssue: boolean;
  shared: boolean;
  issueAction: Action;
  revokeAction: Action;
}) {
  const [shared, setShared] = useState(props.shared);
  const [status, setStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const present = async (url: string, title: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy(url);
    setStatus("링크를 복사했어요.");
  };

  const onShare = () =>
    start(async () => {
      try {
        let url = `${window.location.origin}${props.ownPath}`;
        let title = "반디 내부 게시글";
        if (props.canIssue) {
          if (!shared && !window.confirm("게시글 제목이 카카오·디스코드 미리보기에 표시될 수 있어요. 공유 링크를 만들까요?")) return;
          const body = new FormData();
          body.set(props.idField, String(props.id));
          const result = await props.issueAction(idle, body);
          if (!result.ok || !result.message) {
            setStatus(result.message ?? "공유 링크를 준비하지 못했어요.");
            return;
          }
          url = `${window.location.origin}${result.message}`;
          title = props.title;
          setShared(true);
          setLink(url);
        }
        await present(url, title);
      } catch {
        setStatus("공유 링크를 준비하지 못했어요.");
      }
    });

  const onRevoke = () =>
    start(async () => {
      if (!window.confirm("공유 링크를 중단할까요? 이미 카카오·디스코드에 저장된 제목 미리보기는 바로 지워지지 않을 수 있어요.")) return;
      const body = new FormData();
      body.set(props.idField, String(props.id));
      const result = await props.revokeAction(idle, body);
      setShared(false);
      setLink(null);
      setStatus(result.message ?? "제목 공개 공유 링크를 중단했어요.");
    });

  return (
    <>
      <button type="button" disabled={pending} onClick={onShare} className={buttonClass("outline", "default", "bg-card")}>
        <Icon name="share" className="size-4" />
        공유
      </button>
      {props.canIssue && shared ? (
        <button type="button" disabled={pending} onClick={onRevoke} className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-bold text-destructive hover:bg-destructive-soft">
          공유 중단
        </button>
      ) : null}
      {link ? (
        <p data-testid="share-link" className="w-full break-all rounded-md bg-secondary px-3 py-2 text-xs">
          {link}
        </p>
      ) : null}
      {status ? (
        <p data-testid="share-status" role="status" className="w-full text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </>
  );
}
