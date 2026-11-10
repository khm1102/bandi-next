import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/bandi/activity-detail";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { activityService } from "@/features/activity/instance";
import { canEdit } from "@/features/activity/model";
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
    <div>
      <PageHead title="활동 기록 상세" description="기록 내용과 검수 이력을 확인합니다.">
        <Button variant="outline" href="/activity">내 활동 기록</Button>
        {editable ? <Button variant="outline" href={record.isReportDocument ? `/activity-documents?draft=${record.id}` : `/activity/${record.id}/edit`}>수정·사진 추가</Button> : null}
      </PageHead>
      <ActivityDetailView record={record} fileBase="/api/activity-management" testIdFiles="activity-files">
        {editable && !record.isReportDocument ? (
          <div className="mt-6 flex flex-wrap items-start gap-3 border-t pt-6">
            <SubmitForm recordId={record.id} />
          </div>
        ) : null}
      </ActivityDetailView>
    </div>
  );
}
