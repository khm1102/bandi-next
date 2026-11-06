import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { noticeService } from "@/features/notice/instance";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { ShareControls } from "@/components/share-controls";
import { issueShareAction, revokeShareAction } from "@/features/notice/actions";

export const metadata = { title: "공지 · 반디" };

export default async function NoticeDetailPage({ params }: PageProps<"/notices/[id]">) {
  const principal = await requirePrincipal("/notices");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const notice = await guard(noticeService().lookupReadable(principal.memberId, id));
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">{notice.title}</h1>
      <p className="text-sm text-muted-foreground">
        {notice.teamName ?? "전체"} · {notice.createdByName} · {formatDateTime(notice.publishStartAt)}
      </p>
      <Card>
        <Markdown html={notice.html} />
      </Card>
      {notice.attachments.length > 0 ? (
        <Card title="첨부 파일">
          <ul className="space-y-1 text-sm" data-testid="attachments">
            {notice.attachments.map((a) => (
              <li key={a.id}>
                <a className="underline" href={`/api/internal-notices/${notice.id}/attachments/${a.id}/download`}>
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <ShareControls
        idField="noticeId"
        id={notice.id}
        ownPath={`/notices/${notice.id}`}
        canIssue={notice.canIssueShare}
        shared={notice.shared}
        issueAction={issueShareAction}
        revokeAction={revokeShareAction}
      />
    </>
  );
}
