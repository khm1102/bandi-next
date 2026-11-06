import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL } from "@/features/activity/labels";
import { canArchive, canFinalApprove, canRequestRevision, canTeamApprove } from "@/features/activity/model";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "활동 기록 검수 · 반디" };

export default async function ReviewDetailPage({ params }: PageProps<"/activity/review/[id]">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const record = await guard(activityService().lookupReviewable(principal.memberId, id));
  const admin = principal.access.canManageGlobal();
  const leaderCanReview = principal.access.leader && record.createdByMemberId !== principal.memberId;
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
          <ul className="space-y-1 text-sm">
            {record.files.map((f) => (
              <li key={f.linkId}>
                <a className="underline" href={`/api/activity-reviews/${record.id}/files/${f.fileId}/download`}>
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
                {formatDateTime(h.reviewedAt)} · {h.reviewerName} · {h.previousStatus} → {h.newStatus}
                {h.comment ? ` · ${h.comment}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <ReviewActions
        recordId={record.id}
        can={{
          teamApprove: leaderCanReview && canTeamApprove(record.status),
          finalApprove: admin && canFinalApprove(record.status),
          requestRevision: (admin || leaderCanReview) && canRequestRevision(record.status),
          archive: admin && canArchive(record.status),
        }}
        emergency={record.status === "SUBMITTED"}
      />
    </>
  );
}
