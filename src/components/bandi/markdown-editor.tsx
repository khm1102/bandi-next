"use client";

import { useRef, useState } from "react";

export interface EditorAttachment {
  id: number;
  name: string;
  contentType: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TOOL = "min-h-11 min-w-11 rounded-sm px-2 text-xs font-bold hover:bg-card";

type Wrap = { before: string; after: string; fallback: string };
const WRAPS: Record<string, Wrap> = {
  bold: { before: "**", after: "**", fallback: "굵은 글씨" },
  italic: { before: "_", after: "_", fallback: "기울인 글씨" },
  code: { before: "```\n", after: "\n```", fallback: "코드" },
  link: { before: "[", after: "](https://)", fallback: "링크 이름" },
};
const LINES: Record<string, string> = { "heading-one": "# ", "heading-two": "## ", list: "- ", quote: "> " };
const TABLE = "\n| 제목 | 제목 |\n| --- | --- |\n| 내용 | 내용 |\n";

/**
 * 원본 notice/form.jsp · resources/form.jsp의 본문 편집 영역:
 * 작성/미리보기 탭, Markdown 서식 도구, 첨부 파일 목록. 폼 값(body, attachmentFileId)은 이 컴포넌트가 hidden/textarea로 제출한다.
 */
export function MarkdownEditor({
  initialBody,
  initialAttachments,
  uploadDomain,
  placeholder,
  preview,
  helper,
}: {
  initialBody: string;
  initialAttachments: EditorAttachment[];
  uploadDomain: "notice" | "resource";
  placeholder: string;
  preview: (markdown: string) => Promise<{ ok: boolean; html: string; message: string | null }>;
  helper: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState<"body" | "files" | null>(null);
  const [rendered, setRendered] = useState<{ html: string; message: string | null } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const replaceSelection = (make: (selected: string) => string) => {
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + make(body.slice(start, end)) + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => el?.focus());
  };

  const act = (action: string) => {
    if (WRAPS[action]) {
      const w = WRAPS[action];
      replaceSelection((sel) => `${w.before}${sel || w.fallback}${w.after}`);
    } else if (LINES[action]) {
      replaceSelection((sel) => `${LINES[action]}${sel || "내용"}`);
    } else if (action === "table") {
      replaceSelection(() => TABLE);
    }
  };

  async function upload(file: File): Promise<EditorAttachment | null> {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/files/private?domain=${uploadDomain}`, { method: "POST", body: form });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(failure?.message ?? "업로드하지 못했습니다.");
      return null;
    }
    const { id } = (await response.json()) as { id: number };
    const added = { id, name: file.name, contentType: file.type };
    setAttachments((current) => [...current, added]);
    return added;
  }

  /** 끌어놓은 파일 처리: 본문 위에서는 이미지를 본문에 삽입하고, 나머지는 첨부로 올린다. */
  async function handleDrop(files: FileList, intoBody: boolean) {
    for (const file of Array.from(files)) {
      const added = await upload(file);
      if (added && intoBody && IMAGE_TYPES.has(file.type)) insertImage(added.id);
    }
  }

  const insertImage = (id: number) => replaceSelection(() => `\n![이미지 설명](attachment://${id})\n`);

  async function showPreview() {
    setTab("preview");
    setRendered(null);
    setRendered(await preview(body));
  }

  return (
    <section className="space-y-5" aria-labelledby="editorBodyHeading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="editorBodyHeading" className="text-base font-extrabold">본문</h2>
        <div className="flex rounded-md border bg-card p-1" role="tablist" aria-label="본문 보기 방식">
          <button type="button" role="tab" aria-selected={tab === "write"} className={`min-h-11 rounded-sm px-3 text-sm font-bold ${tab === "write" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("write")}>
            작성
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={`min-h-11 rounded-sm px-3 text-sm font-bold ${tab === "preview" ? "bg-secondary" : "text-muted-foreground"}`} onClick={showPreview}>
            미리보기
          </button>
        </div>
      </div>

      <div className={`mt-3 ${tab === "write" ? "" : "hidden"}`} role="tabpanel">
        <div className="overflow-x-auto rounded-t-md border border-b-0 bg-secondary/50">
          <div className="flex min-w-max gap-1 p-2" aria-label="Markdown 서식 도구">
            <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 text-sm font-extrabold hover:bg-card" onClick={() => act("bold")} aria-label="굵게" title="굵게">B</button>
            <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 text-sm italic hover:bg-card" onClick={() => act("italic")} aria-label="기울임" title="기울임">I</button>
            <span className="mx-1 h-7 self-center border-l" aria-hidden="true" />
            <button type="button" className={TOOL} onClick={() => act("heading-one")}>H1</button>
            <button type="button" className={TOOL} onClick={() => act("heading-two")}>H2</button>
            <button type="button" className={TOOL} onClick={() => act("list")}>목록</button>
            <button type="button" className={TOOL} onClick={() => act("quote")}>인용</button>
            <button type="button" className={TOOL} onClick={() => act("code")}>코드</button>
            <button type="button" className={TOOL} onClick={() => act("link")}>링크</button>
            <button type="button" className={TOOL} onClick={() => act("table")}>표</button>
            <label className={`${TOOL} inline-flex cursor-pointer items-center justify-center`}>
              이미지
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="본문 이미지 추가"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const added = await upload(file);
                  if (added) insertImage(added.id);
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          ref={area}
          name="body"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onDragOver={(e) => { e.preventDefault(); setDropping("body"); }}
          onDragLeave={() => setDropping(null)}
          onDrop={(e) => { e.preventDefault(); setDropping(null); void handleDrop(e.dataTransfer.files, true); }}
          className={`min-h-[30rem] w-full rounded-b-md border bg-card px-4 py-4 font-mono text-base leading-6 placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm ${dropping === "body" ? "border-ring bg-secondary/60" : "border-input"}`}
          placeholder={placeholder}
          aria-label="본문"
        />
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p>
      </div>

      {tab === "preview" ? (
        <div className="mt-3 rounded-md border bg-card p-5" role="tabpanel" data-testid="preview" tabIndex={-1}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold">미리보기</h3>
            <span className="text-xs text-muted-foreground" aria-live="polite">{rendered ? "" : "불러오는 중"}</span>
          </div>
          {rendered?.message ? (
            <p className="mt-5 text-sm text-destructive">{rendered.message}</p>
          ) : rendered?.html ? (
            // rendered.html은 서버 액션이 renderMarkdown(sanitizer)을 거쳐 돌려준 값이다.
            <div className="markdown-content mt-5" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          ) : (
            <div className="markdown-content mt-5"><p className="text-muted-foreground">내용을 입력하면 여기에 미리보기가 표시돼요.</p></div>
          )}
        </div>
      ) : null}

      <div
        className={`border-x border-b px-4 py-3 transition-colors sm:flex sm:items-center sm:justify-between sm:gap-4 ${dropping === "files" ? "bg-secondary" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDropping("files"); }}
        onDragLeave={() => setDropping(null)}
        onDrop={(e) => { e.preventDefault(); setDropping(null); void handleDrop(e.dataTransfer.files, false); }}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold">첨부 파일</h3>
          <p className="mt-1 text-xs text-muted-foreground">파일을 여기에 끌어놓거나 버튼으로 첨부해요. 본문 이미지는 이미지 버튼이나 본문에 끌어놓으면 자동으로 함께 추가돼요.</p>
        </div>
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary sm:mt-0">
          파일 첨부
          <input
            className="sr-only"
            type="file"
            multiple
            aria-label="파일 첨부"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              for (const file of files) await upload(file);
            }}
          />
        </label>
      </div>
      {error ? <p className="border-x border-b border-destructive bg-destructive-soft px-4 py-2.5 text-sm text-destructive" role="alert">{error}</p> : null}
      <ul className="space-y-2 border-x border-b px-4 py-3">
        {attachments.length === 0 ? <li className="text-xs text-muted-foreground">첨부한 파일이 없습니다.</li> : null}
        {attachments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="attachmentFileId" value={a.id} />
            <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
            {IMAGE_TYPES.has(a.contentType) ? (
              <button type="button" className="min-h-11 rounded-md border px-3 text-xs font-bold hover:bg-secondary" onClick={() => insertImage(a.id)}>
                본문에 삽입
              </button>
            ) : null}
            <button type="button" className="min-h-11 rounded-md border px-3 text-xs font-bold text-destructive hover:bg-destructive-soft" onClick={() => setAttachments((c) => c.filter((x) => x.id !== a.id))}>
              제거
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
