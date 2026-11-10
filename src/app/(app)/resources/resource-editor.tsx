"use client";

import { EditorForm, TITLE_INPUT } from "@/components/bandi/editor-form";
import { MarkdownEditor, type EditorAttachment } from "@/components/bandi/markdown-editor";
import { previewResourceMarkdownAction, saveResourceAction } from "@/features/resource/actions";

export interface ResourceEditorValues {
  resourceId?: number;
  title: string;
  body: string;
  attachments: EditorAttachment[];
}

export function ResourceEditor({ values }: { values: ResourceEditorValues }) {
  return (
    <EditorForm action={saveResourceAction} cancelHref="/resources" submitLabel="자료 저장">
      {values.resourceId ? <input type="hidden" name="resourceId" value={values.resourceId} /> : null}
      <div>
        <label className="mb-2 block text-sm font-extrabold" htmlFor="resourceTitle">제목</label>
        <input id="resourceTitle" name="title" className={TITLE_INPUT} maxLength={200} required placeholder="자료 제목을 입력하세요" defaultValue={values.title} />
      </div>
      <div className="border-t pt-6">
        <MarkdownEditor
          initialBody={values.body}
          initialAttachments={values.attachments}
          uploadDomain="resource"
          placeholder={"# 자료 제목\n\n자료 내용을 Markdown으로 작성하세요. 단독 HTTPS URL은 저장 후 링크 카드로 보여요."}
          preview={previewResourceMarkdownAction}
          helper="제목, 목록, 링크, 인용, 코드 블록, 표를 사용할 수 있어요. 이미지 버튼으로 본문 이미지를 추가할 수 있고, 단독 HTTPS URL은 저장 후 링크 카드로 보여요. HTML은 지원하지 않아요."
        />
      </div>
    </EditorForm>
  );
}
