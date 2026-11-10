"use client";

import { DateTimeField } from "@/components/bandi/date-time-field";
import { useState } from "react";
import { EditorForm, TITLE_INPUT } from "@/components/bandi/editor-form";
import { MarkdownEditor, type EditorAttachment } from "@/components/bandi/markdown-editor";
import { previewMarkdownAction, saveNoticeAction } from "@/features/notice/actions";

interface Option {
  id: number;
  name: string;
}

export interface NoticeEditorValues {
  noticeId?: number;
  targetScope: "ALL" | "TEAM";
  teamId: number | null;
  title: string;
  body: string;
  important: boolean;
  /** 이미 게시된 공지는 편집만 가능하다 (게시 버튼 숨김). */
  published?: boolean;
  attachments: EditorAttachment[];
}

const SELECT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm";

export function NoticeEditor({ values, teams, allowAll }: { values: NoticeEditorValues; teams: Option[]; allowAll: boolean }) {
  const [scope, setScope] = useState(values.targetScope);
  const [schedule, setSchedule] = useState(false);
  return (
    <EditorForm action={saveNoticeAction} cancelHref="/notices" submitLabel="초안 저장" secondarySubmit={values.noticeId && values.published ? undefined : { label: "공지 게시", value: "publish" }}>
      {values.noticeId ? <input type="hidden" name="noticeId" value={values.noticeId} /> : null}
      <section className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-extrabold" htmlFor="noticeTitle">제목</label>
          <input id="noticeTitle" name="title" className={TITLE_INPUT} maxLength={200} required placeholder="공지 제목을 입력하세요" defaultValue={values.title} />
        </div>
        <div className="flex flex-wrap items-end gap-4 border-b pb-5">
          <div className="min-w-52">
            <label className="mb-2 block text-sm font-bold" htmlFor="noticeTarget">게시 대상</label>
            <select id="noticeTarget" name="targetScope" value={scope} onChange={(e) => setScope(e.target.value as "ALL" | "TEAM")} className={SELECT}>
              {allowAll ? <option value="ALL">전체 멤버</option> : null}
              <option value="TEAM">소속 팀 멤버</option>
            </select>
          </div>
          {scope === "TEAM" ? (
            <div className="min-w-52">
              <label className="mb-2 block text-sm font-bold" htmlFor="noticeTeam">대상 팀</label>
              <select id="noticeTeam" name="teamId" defaultValue={values.teamId ?? teams[0]?.id} className={SELECT}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary">
            <input className="size-4 rounded" type="checkbox" name="important" defaultChecked={values.important} />
            중요 공지
          </label>
          <label className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary">
            <input className="size-4 rounded" type="checkbox" name="scheduleEnabled" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
            예약 게시
          </label>
          {schedule ? (
            <div className="min-w-64">
              <DateTimeField id="noticePublishAt" name="publishAt" label="게시 시각" required />
              <p className="mt-1.5 text-xs text-muted-foreground">&quot;공지 게시&quot;를 누르면 이 시각부터 멤버에게 보여요.</p>
            </div>
          ) : null}
        </div>
        <MarkdownEditor
          initialBody={values.body}
          initialAttachments={values.attachments}
          uploadDomain="notice"
          placeholder={"# 공지 제목\n\n공지 내용을 Markdown으로 작성하세요."}
          preview={(markdown) => previewMarkdownAction(markdown, values.noticeId)}
          helper="제목, 목록, 링크, 인용, 코드 블록, 표를 사용할 수 있어요. 이미지 버튼으로 본문 이미지를 추가할 수 있고, 외부 이미지는 HTTPS Markdown 주소만 지원해요. HTML은 지원하지 않아요."
        />
      </section>
    </EditorForm>
  );
}
