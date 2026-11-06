import { Card } from "@/components/ui";
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
      <h1 className="text-2xl font-black tracking-tight">활동 기록 작성</h1>
      <Card>
        <ActivityEditor
          teams={teams}
          canChooseTeam={principal.access.canManageGlobal()}
          values={{ teamId: principal.teamId, activityAt: toKstDateTimeInput(new Date()), title: "", body: "", participantCount: 1, photos: [] }}
        />
      </Card>
    </>
  );
}
