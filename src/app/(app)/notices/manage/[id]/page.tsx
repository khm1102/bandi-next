import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { DataTable } from "@/components/data-table";
import { Markdown } from "@/components/markdown";
import { noticeService } from "@/features/notice/instance";
import { STATUS_LABEL } from "@/features/notice/labels";
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
    if (error instanceof InvalidNoticeStateError) return [];
    throw error;
  });
  const readCount = statuses.filter((s) => s.firstReadAt).length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">{notice.title}</h1>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold" data-testid="notice-status">
          {STATUS_LABEL[notice.status]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {notice.teamName ?? "전체"} · {notice.createdByName} · 게시 {formatDateTime(notice.publishStartAt)}
        {notice.publishEndAt ? ` ~ ${formatDateTime(notice.publishEndAt)}` : ""}
      </p>
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
      <Card>
        <Markdown html={notice.html} />
      </Card>
      {notice.attachments.length > 0 ? (
        <Card title="첨부 파일">
          <ul className="space-y-1 text-sm">
            {notice.attachments.map((a) => (
              <li key={a.id}>
                <a className="underline" href={`/api/internal-notice-management/${notice.id}/attachments/${a.id}/download`}>
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {statuses.length > 0 ? (
        <Card title={`읽음 현황 (${readCount}/${statuses.length})`}>
          <DataTable
            caption="멤버별 공지 확인 현황"
            testId="read-statuses"
            rows={statuses}
            rowKey={(s) => s.memberId}
            columns={[
              { header: "이름", cell: (s) => <strong>{s.name}</strong> },
              { header: "팀", cell: (s) => s.teamName },
              { header: "확인", cell: (s) => (s.firstReadAt ? `확인 ${formatDateTime(s.firstReadAt)}` : "미확인"), className: "whitespace-nowrap" },
            ]}
          />
        </Card>
      ) : null}
      <Link href="/notices/manage" className="text-sm underline">
        목록으로
      </Link>
    </>
  );
}
