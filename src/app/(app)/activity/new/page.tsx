import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { memberService } from "@/features/member/instance";
import { toKstDateTimeInput } from "@/lib/kst";
import { requirePrincipal } from "@/lib/session";
import { ActivityEditor } from "../activity-editor";

export const metadata = { title: "활동 기록 작성 · 반디" };

export default async function NewActivityPage() {
  const principal = await requirePrincipal("/activity/new");
  const teams = await memberService().searchTeams();
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHead title="간단 활동 기록" description="사진은 선택 사항이며, 제출 후 팀장과 관리자가 순서대로 검수합니다.">
          <Button variant="outline" href="/activity">내 활동 기록</Button>
        </PageHead>
        <div className="rounded-lg border bg-card p-5 md:p-7">
            <ActivityEditor
              teams={teams}
              canChooseTeam={principal.access.canManageGlobal()}
              values={{ teamId: principal.teamId, activityAt: toKstDateTimeInput(new Date()), title: "", body: "", participantCount: 1, photos: [] }}
            />
            </div>
      </div>

    </>
  );
}
