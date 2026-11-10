import { notFound } from "next/navigation";
import { Badge } from "@/components/bandi/badge";
import { Button } from "@/components/bandi/button";
import { Markdown } from "@/components/markdown";
import { ShareControls } from "@/components/share-controls";
import { issueShareAction, revokeShareAction } from "@/features/notice/actions";
import { noticeService } from "@/features/notice/instance";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "공지 · 반디" };

export default async function NoticeDetailPage({ params }: PageProps<"/notices/[id]">) {
  const principal = await requirePrincipal("/notices");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const notice = await guard(noticeService().lookupReadable(principal.memberId, id));
  return (
    <article className="mx-auto max-w-4xl rounded-xl border bg-card p-5 md:p-8">
      <div className="border-b pb-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{notice.targetScope === "TEAM" ? notice.teamName : "전체 공지"}</Badge>
          {notice.important ? <Badge tone="warning" dot>중요</Badge> : null}
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-tight">{notice.title}</h1>
        <p className="mt-3 text-xs text-muted-foreground">
          작성 {notice.createdByName} · {formatDateTime(notice.publishStartAt)} 게시
          {notice.publishedByName && notice.publishedByName !== notice.createdByName ? ` · 게시 ${notice.publishedByName}` : ""}
          {notice.updatedAt.getTime() - (notice.publishStartAt?.getTime() ?? 0) > 60_000 ? ` · ${formatDateTime(notice.updatedAt)} 수정` : ""}
        </p>
      </div>
      <Markdown html={notice.html} className="mt-7" />
      {notice.attachments.length > 0 ? (
        <section className="mt-8 border-t pt-5">
          <h2 className="text-sm font-extrabold">첨부 파일</h2>
          <ul className="mt-3 flex flex-col gap-2" data-testid="attachments">
            {notice.attachments.map((a) => (
              <li key={a.id}>
                <a className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-bold hover:bg-secondary" href={`/api/internal-notices/${notice.id}/attachments/${a.id}/download`}>
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-2 border-t pt-5">
        <Button variant="outline" href="/notices">목록으로</Button>
        <ShareControls idField="noticeId" id={notice.id} ownPath={`/notices/${notice.id}`} title={notice.title} canIssue={notice.canIssueShare} shared={notice.shared} issueAction={issueShareAction} revokeAction={revokeShareAction} />
        {notice.canManage ? <Button href={`/notices/manage/${notice.id}`}>공지 관리</Button> : null}
      </div>
    </article>
  );
}
