import { forbidden } from "next/navigation";
import { Card } from "@/components/ui";
import { memberService } from "@/features/member/instance";
import { requirePrincipal } from "@/lib/session";
import { NoticeEditor } from "../notice-editor";

export const metadata = { title: "공지 작성 · 반디" };

export default async function WriteNoticePage() {
  const principal = await requirePrincipal("/notices/write");
  const canGlobal = principal.access.canManageGlobal();
  if (!canGlobal && !(principal.access.leader && principal.access.active)) forbidden();
  const allTeams = await memberService().searchTeams();
  const teams = canGlobal ? allTeams : allTeams.filter((t) => t.id === principal.teamId);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">공지 작성</h1>
      <Card>
        <NoticeEditor
          teams={teams}
          allowAll={canGlobal}
          values={{ targetScope: canGlobal ? "ALL" : "TEAM", teamId: canGlobal ? null : principal.teamId, title: "", body: "", important: false, attachments: [] }}
        />
      </Card>
    </>
  );
}
