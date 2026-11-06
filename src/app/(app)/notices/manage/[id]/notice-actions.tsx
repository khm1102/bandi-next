"use client";

import Link from "next/link";
import { ActionForm, Card, Field, inputClass } from "@/components/ui";
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

export function NoticeActions({ noticeId, can, editHref }: { noticeId: number; can: Can; editHref: string }) {
  const hidden = <input type="hidden" name="noticeId" value={noticeId} />;
  return (
    <Card title="작업">
      <div className="space-y-4">
        {can.edit ? (
          <Link href={editHref} className="inline-block inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
            수정
          </Link>
        ) : null}
        {can.publish ? (
          <ActionForm action={publishNoticeAction} submitLabel="게시">
            {hidden}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="게시 시작 (비우면 즉시)">
                <input type="datetime-local" name="publishStart" className={inputClass} />
              </Field>
              <Field label="게시 종료 (선택)">
                <input type="datetime-local" name="publishEnd" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {can.close ? (
            <ActionForm action={closeNoticeAction} submitLabel="종료" className="space-y-2">
              {hidden}
            </ActionForm>
          ) : null}
          {can.archive ? (
            <ActionForm action={archiveNoticeAction} submitLabel="보관" className="space-y-2">
              {hidden}
            </ActionForm>
          ) : null}
          {can.returnToDraft ? (
            <ActionForm action={returnToDraftAction} submitLabel="초안으로 되돌리기" className="space-y-2">
              {hidden}
            </ActionForm>
          ) : null}
          {can.delete ? (
            <ActionForm action={deleteNoticeAction} submitLabel="삭제" className="space-y-2">
              {hidden}
            </ActionForm>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
