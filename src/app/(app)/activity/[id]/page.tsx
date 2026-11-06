import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL } from "@/features/activity/labels";
import { canEdit } from "@/features/activity/model";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { SubmitForm } from "./submit-form";

export const metadata = { title: "활동 기록 · 반디" };

export default async function ActivityDetailPage({ params }: PageProps<"/activity/[id]">) {
  const principal = await requirePrincipal("/activity");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const record = await guard(activityService().lookupManageable(principal.memberId, id));
  const editable = canEdit(record.status);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">{record.title}</h1>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold" data-testid="activity-status">
          {ACTIVITY_STATUS_LABEL[record.status]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {record.teamName} · {record.authorName} · {formatDateTime(record.activityAt)} · {record.participantCount}명
      </p>
      <Card>
        <p className="whitespace-pre-wrap text-sm">{record.body}</p>
      </Card>
      {record.files.length > 0 ? (
        <Card title="파일">
          <ul className="space-y-1 text-sm" data-testid="activity-files">
            {record.files.map((f) => (
              <li key={f.linkId}>
                <a className="underline" href={`/api/activity-management/${record.id}/files/${f.fileId}/download`}>
                  {f.name}
                </a>{" "}
                <span className="text-xs text-muted-foreground">({f.role})</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {record.history.length > 0 ? (
        <Card title="검수 이력">
          <ul className="space-y-1 text-sm" data-testid="activity-history">
            {record.history.map((h, i) => (
              <li key={i}>
                {formatDateTime(h.reviewedAt)} · {h.reviewerName} · {ACTIVITY_STATUS_LABEL[h.previousStatus as keyof typeof ACTIVITY_STATUS_LABEL]} →{" "}
                {ACTIVITY_STATUS_LABEL[h.newStatus as keyof typeof ACTIVITY_STATUS_LABEL]}
                {h.comment ? ` · ${h.comment}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {editable ? (
        <Card title="작업">
          <div className="flex flex-wrap items-start gap-4">
            <Link
              href={record.isReportDocument ? `/activity-documents?draft=${record.id}` : `/activity/${record.id}/edit`}
              className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary"
            >
              수정
            </Link>
            {!record.isReportDocument ? <SubmitForm recordId={record.id} /> : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}
