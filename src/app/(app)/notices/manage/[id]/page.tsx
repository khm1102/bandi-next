import { notFound } from "next/navigation";
import { Badge } from "@/components/bandi/badge";
import { Button } from "@/components/bandi/button";
import { Markdown } from "@/components/markdown";
import { noticeService } from "@/features/notice/instance";
import { STATUS_LABEL, STATUS_TONE } from "@/features/notice/labels";
import { InvalidNoticeStateError, canArchive, canClose, canDelete, canEdit, canReturnToDraft } from "@/features/notice/model";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";
import { NoticeActions } from "./notice-actions";

export const metadata = { title: "공지 관리 · 반디" };

export default async function ManageNoticeDetailPage({ params }: PageProps<"/notices/manage/[id]">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const service = noticeService();
  const notice = await guard(service.lookupManageable(principal.memberId, id));
  // 게시 이력이 없는 초안에는 읽음 현황이 없다.
  const statuses = await service.searchReadStatuses(principal.memberId, id).catch((error: unknown) => {
    if (error instanceof InvalidNoticeStateError) return null;
    throw error;
  });
  const readCount = statuses?.filter((s) => s.firstReadAt).length ?? 0;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted-foreground">공지 관리</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">공지 상태와 확인 현황을 관리하세요</h1>
        </div>
        <Button variant="outline" href="/notices/manage">관리 목록</Button>
      </div>
      <article className="rounded-xl border bg-card p-5 md:p-8">
        <header className="border-b pb-6">
          <div className="flex flex-wrap gap-2">
            <span data-testid="notice-status"><Badge tone={STATUS_TONE[notice.status]}>{STATUS_LABEL[notice.status]}</Badge></span>
            <Badge tone="info">{notice.targetScope === "TEAM" ? notice.teamName : "전체 공지"}</Badge>
            {notice.important ? <Badge tone="warning" dot>중요</Badge> : null}
          </div>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{notice.title}</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex gap-2"><dt className="font-bold text-foreground">작성</dt><dd>{notice.createdByName}</dd></div>
            <div className="flex gap-2"><dt className="font-bold text-foreground">최근 수정</dt><dd>{notice.updatedByName ?? notice.createdByName} · {formatDateTime(notice.updatedAt)}</dd></div>
            {notice.publishedByName ? (
              <div className="flex gap-2"><dt className="font-bold text-foreground">게시</dt><dd>{notice.publishedByName}{notice.publishStartAt ? ` · ${formatDateTime(notice.publishStartAt)}` : ""}</dd></div>
            ) : null}
          </dl>
        </header>
        <Markdown html={notice.html} className="mt-7" />
        {notice.attachments.length > 0 ? (
          <section className="mt-8 border-t pt-5">
            <h3 className="text-sm font-extrabold">첨부 파일</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {notice.attachments.map((a) => (
                <li key={a.id}>
                  <a className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-bold hover:bg-secondary" href={`/api/internal-notice-management/${notice.id}/attachments/${a.id}/download`}>
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      {statuses ? (
        <section className="mt-5 rounded-xl border bg-card p-5" aria-labelledby="readStatusTitle">
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <span>
                <span id="readStatusTitle" className="block text-base font-extrabold">확인 현황</span>
                <span className="mt-1 block text-sm text-muted-foreground">{statuses.length}명 중 {readCount}명이 확인했어요.</span>
              </span>
              <span className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold">멤버별 현황 보기</span>
            </summary>
            <ul className="mt-4 divide-y border-t pt-4" data-testid="read-statuses">
              {statuses.map((s) => (
                <li key={s.memberId} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <b className="block">{s.name}</b>
                    <span className="text-xs text-muted-foreground">{s.teamName} · {s.studentNo}</span>
                  </div>
                  <span className={s.firstReadAt ? "font-bold text-success" : "font-bold text-muted-foreground"}>
                    {s.lastReadAt ? formatDateTime(s.lastReadAt) : "미확인"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      <NoticeActions
        noticeId={notice.id}
        can={{
          edit: canEdit(notice.status),
          publish: canEdit(notice.status),
          close: canClose(notice.status),
          archive: canArchive(notice.status),
          returnToDraft: canReturnToDraft(notice.status),
          delete: canDelete(notice.status),
        }}
        editHref={`/notices/${notice.id}/edit`}
      />
    </div>
  );
}
