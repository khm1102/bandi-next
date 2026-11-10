import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/bandi/activity-detail";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { activityService } from "@/features/activity/instance";
import { canArchive, canFinalApprove, canRequestRevision, canTeamApprove } from "@/features/activity/model";
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
    <div>
      <PageHead title="활동 기록 검수" description="기록 내용과 제출 이력을 확인한 뒤 다음 단계를 결정합니다.">
        <Button variant="outline" href="/activity/review">검수 목록</Button>
      </PageHead>
      <ActivityDetailView record={record} fileBase="/api/activity-reviews" testIdFiles="review-files">
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
      </ActivityDetailView>
    </div>
  );
}
