import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { activityService } from "@/features/activity/instance";
import { canEdit } from "@/features/activity/model";
import { memberService } from "@/features/member/instance";
import { toKstDateTimeInput } from "@/lib/kst";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { ActivityEditor } from "../../activity-editor";

export const metadata = { title: "활동 기록 수정 · 반디" };

export default async function EditActivityPage({ params }: PageProps<"/activity/[id]/edit">) {
  const principal = await requirePrincipal("/activity");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const record = await guard(activityService().lookupManageable(principal.memberId, id));
  if (record.isReportDocument) redirect(`/activity-documents?draft=${record.id}`);
  if (!canEdit(record.status)) redirect(`/activity/${record.id}`);
  const teams = await memberService().searchTeams();
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHead title="간단 활동 기록 수정" description="사진은 선택 사항이며, 제출 후 팀장과 관리자가 순서대로 검수합니다.">
          <Button variant="outline" href="/activity">내 활동 기록</Button>
        </PageHead>
        <div className="rounded-lg border bg-card p-5 md:p-7">
            <ActivityEditor
              recordId={record.id}
              teams={teams}
              canChooseTeam={false}
              values={{
                teamId: record.teamId,
                activityAt: toKstDateTimeInput(record.activityAt),
                title: record.title,
                body: record.body,
                participantCount: record.participantCount,
                photos: record.files.filter((f) => f.role !== "DOCUMENT").map((f) => ({ id: f.fileId, name: f.name })),
              }}
            />
            </div>
      </div>

    </>
  );
}
