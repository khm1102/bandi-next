import { forbidden } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
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
      <div className="mx-auto max-w-5xl">
        <PageHead title="공지 작성" description="동아리 멤버에게 전달할 내용을 작성하세요.">
          <Button variant="outline" href="/notices">목록으로</Button>
        </PageHead>
      </div>
      <NoticeEditor
        teams={teams}
        allowAll={canGlobal}
        values={{ targetScope: canGlobal ? "ALL" : "TEAM", teamId: canGlobal ? null : principal.teamId, title: "", body: "", important: false, attachments: [] }}
      />

    </>
  );
}
