"use client";

import { DateTimeField } from "@/components/bandi/date-time-field";
import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/bandi/button";
import { submitKeepingValues } from "@/components/bandi/keep-values";
import { Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import {
  archiveNoticeAction,
  closeNoticeAction,
  deleteNoticeAction,
  publishNoticeAction,
  returnToDraftAction,
} from "@/features/notice/actions";

interface Can {
  edit: boolean;
  publish: boolean;
  close: boolean;
  archive: boolean;
  returnToDraft: boolean;
  delete: boolean;
}

const initial: ActionState = { ok: false, message: null };

/** 확인(confirm) 후 제출하는 상태 전이 버튼. 서버가 상태·권한을 다시 검사한다. */
function ConfirmAction({ action, noticeId, label, confirm, variant = "outline", state }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; noticeId: number; label: string; confirm: string; variant?: "outline" | "danger" | "primary"; state: [ActionState, (f: FormData) => void, boolean] }) {
  void action;
  const [, formAction, pending] = state;
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="noticeId" value={noticeId} />
      <button type="submit" disabled={pending} className={buttonClass(variant)}>
        {label}
      </button>
    </form>
  );
}

function useAct(action: (s: ActionState, f: FormData) => Promise<ActionState>): [ActionState, (f: FormData) => void, boolean] {
  return useActionState(action, initial);
}

export function NoticeActions({ noticeId, can, editHref }: { noticeId: number; can: Can; editHref: string }) {
  const close = useAct(closeNoticeAction);
  const archive = useAct(archiveNoticeAction);
  const back = useAct(returnToDraftAction);
  const del = useAct(deleteNoticeAction);
  const publish = useActionState(publishNoticeAction, initial);
  const [open, setOpen] = useState(false);
  const shown: ActionState = [close, archive, back, del].map(([s]) => s).find((s) => s.message) ?? publish[0];
  return (
    <section className="mt-5 rounded-xl border bg-card p-5" aria-labelledby="noticeActionsTitle">
      <h2 id="noticeActionsTitle" className="text-base font-extrabold">가능한 작업</h2>
      <p className="mt-1 text-sm text-muted-foreground">현재 상태에서 안전하게 실행할 수 있는 작업만 보여드려요.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {can.edit ? <Link href={editHref} className={buttonClass("primary")}>초안 수정</Link> : null}
        {can.publish ? (
          <button type="button" className={buttonClass("primary")} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            게시
          </button>
        ) : null}
        {can.delete ? <ConfirmAction action={deleteNoticeAction} noticeId={noticeId} label="초안 삭제" variant="danger" confirm="이 초안을 삭제합니다. 목록과 상세에서 더 이상 찾을 수 없어요." state={del} /> : null}
        {can.close ? <ConfirmAction action={closeNoticeAction} noticeId={noticeId} label="게시 종료" variant="danger" confirm="공지 게시를 종료합니다. 멤버 공지 목록에서 즉시 내려가요." state={close} /> : null}
        {can.archive ? <ConfirmAction action={archiveNoticeAction} noticeId={noticeId} label="공지 보관" variant="primary" confirm="종료된 공지를 보관합니다. 관리 목록의 보관 필터에서 계속 확인할 수 있어요." state={archive} /> : null}
        {can.returnToDraft ? <ConfirmAction action={returnToDraftAction} noticeId={noticeId} label="초안으로 복구" confirm="공지를 초안으로 되돌립니다. 이전 게시 시각과 읽음 현황은 초기화돼요." state={back} /> : null}
      </div>
      {can.publish && open ? (
        <form action={publish[1]} onSubmit={submitKeepingValues(publish[1])} className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
          <input type="hidden" name="noticeId" value={noticeId} />
          <DateTimeField name="publishStart" label="게시 시작 (비우면 즉시)" />
          <DateTimeField name="publishEnd" label="게시 종료 (선택)" />
          <div className="md:col-span-2">
            <button type="submit" disabled={publish[2]} className={buttonClass("primary")}>
              게시하기
            </button>
          </div>
        </form>
      ) : null}
      <div className="mt-3 empty:hidden">
        <Notice state={shown} />
      </div>
    </section>
  );
}
