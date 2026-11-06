"use client";

import { useRef, useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import { saveResourceAction } from "@/features/resource/actions";

interface Attachment {
  id: number;
  name: string;
  contentType: string;
}

export interface ResourceEditorValues {
  resourceId?: number;
  title: string;
  body: string;
  attachments: Attachment[];
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ResourceEditor({ values }: { values: ResourceEditorValues }) {
  const [body, setBody] = useState(values.body);
  const [attachments, setAttachments] = useState<Attachment[]>(values.attachments);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function upload(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files/private?domain=resource", { method: "POST", body: form });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      setUploadError(error?.message ?? "업로드하지 못했습니다.");
      return;
    }
    const { id } = (await response.json()) as { id: number };
    setAttachments((current) => [...current, { id, name: file.name, contentType: file.type }]);
  }

  function insertImage(id: number) {
    const token = `\n![이미지 설명](attachment://${id})\n`;
    const el = textarea.current;
    if (!el) {
      setBody((current) => current + token);
      return;
    }
    const start = el.selectionStart;
    setBody((current) => current.slice(0, start) + token + current.slice(el.selectionEnd));
  }

  return (
    <ActionForm action={saveResourceAction} submitLabel="저장">
      {values.resourceId ? <input type="hidden" name="resourceId" value={values.resourceId} /> : null}
      <Field label="제목">
        <input name="title" required maxLength={200} defaultValue={values.title} className={inputClass} />
      </Field>
      <Field label="본문 (Markdown)">
        <textarea ref={textarea} name="body" required rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} font-mono`} />
      </Field>
      <p className="text-xs text-muted-foreground">줄 전체가 HTTPS 주소이면 링크 카드가 만들어집니다. 이미지는 첨부한 파일만 쓸 수 있습니다.</p>
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
    </ActionForm>
  );
}
