import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/bandi/activity-detail";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { activityService } from "@/features/activity/instance";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "승인 활동 기록 · 반디" };

export default async function ArchiveDetailPage({ params }: PageProps<"/activity/archive/[id]">) {
  const principal = await requirePrincipal("/activity/archive");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const record = await guard(activityService().lookupApproved(principal.memberId, id));
  return (
    <div>
      <PageHead title="승인 활동 기록" description="최종 승인된 활동 기록의 내용과 첨부를 확인합니다.">
        <Button variant="outline" href="/activity/archive">승인 기록</Button>
      </PageHead>
      <ActivityDetailView record={{ ...record, status: "APPROVED" }} fileBase="/api/activity-records" testIdFiles="archive-files" />
    </div>
  );
}
