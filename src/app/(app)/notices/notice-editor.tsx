"use client";

import { useRef, useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import { previewMarkdownAction, saveNoticeAction } from "@/features/notice/actions";

interface Option {
  id: number;
  name: string;
}
interface Attachment {
  id: number;
  name: string;
  contentType: string;
}

export interface NoticeEditorValues {
  noticeId?: number;
  targetScope: "ALL" | "TEAM";
  teamId: number | null;
  title: string;
  body: string;
  important: boolean;
  attachments: Attachment[];
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function NoticeEditor({ values, teams, allowAll }: { values: NoticeEditorValues; teams: Option[]; allowAll: boolean }) {
  const [scope, setScope] = useState(values.targetScope);
  const [body, setBody] = useState(values.body);
  const [attachments, setAttachments] = useState<Attachment[]>(values.attachments);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ html: string; message: string | null } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function upload(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files/private?domain=notice", { method: "POST", body: form });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      setUploadError(error?.message ?? "업로드하지 못했습니다.");
      return;
    }
    const { id } = (await response.json()) as { id: number };
    setAttachments((current) => [...current, { id, name: file.name, contentType: file.type }]);
  }

  function insertImage(id: number) {
    const el = textarea.current;
    const token = `\n![이미지 설명](attachment://${id})\n`;
    if (!el) {
      setBody((current) => current + token);
      return;
    }
    const start = el.selectionStart;
    setBody((current) => current.slice(0, start) + token + current.slice(el.selectionEnd));
  }

  async function showPreview() {
    const result = await previewMarkdownAction(body, values.noticeId);
    setPreview({ html: result.html, message: result.message });
  }

  return (
    <ActionForm action={saveNoticeAction} submitLabel="저장">
      {values.noticeId ? <input type="hidden" name="noticeId" value={values.noticeId} /> : null}
      <Field label="제목">
        <input name="title" required maxLength={200} defaultValue={values.title} className={inputClass} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="대상">
          <select name="targetScope" value={scope} onChange={(e) => setScope(e.target.value as "ALL" | "TEAM")} className={inputClass}>
            {allowAll ? <option value="ALL">전체 멤버</option> : null}
            <option value="TEAM">팀</option>
          </select>
        </Field>
        {scope === "TEAM" ? (
          <Field label="팀">
            <select name="teamId" defaultValue={values.teamId ?? teams[0]?.id} className={inputClass}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="important" defaultChecked={values.important} />
        중요 공지
      </label>
      <Field label="본문 (Markdown)">
        <textarea ref={textarea} name="body" required rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} font-mono`} />
      </Field>
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p className="font-semibold">첨부 파일</p>
        <input
          type="file"
          aria-label="파일 첨부"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await upload(file);
            e.target.value = "";
          }}
        />
        {uploadError ? <p className="text-destructive">{uploadError}</p> : null}
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <input type="hidden" name="attachmentFileId" value={a.id} />
              <span>{a.name}</span>
              {IMAGE_TYPES.has(a.contentType) ? (
                <button type="button" className="underline" onClick={() => insertImage(a.id)}>
                  본문에 삽입
                </button>
              ) : null}
              <button type="button" className="text-destructive underline" onClick={() => setAttachments((c) => c.filter((x) => x.id !== a.id))}>
                제거
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={showPreview} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
        미리보기
      </button>
      {preview ? (
        preview.message ? (
          <p className="text-sm text-destructive">{preview.message}</p>
        ) : (
          // preview.html 은 서버 액션이 renderMarkdown(sanitizer)을 거쳐 돌려준 값이다.
          <div data-testid="preview" className="rounded-lg border border-border p-3 text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
        )
      ) : null}
    </ActionForm>
  );
}
