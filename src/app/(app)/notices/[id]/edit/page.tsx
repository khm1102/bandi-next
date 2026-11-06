import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { memberService } from "@/features/member/instance";
import { noticeService } from "@/features/notice/instance";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { NoticeEditor } from "../../notice-editor";

export const metadata = { title: "공지 수정 · 반디" };

export default async function EditNoticePage({ params }: PageProps<"/notices/[id]/edit">) {
  const principal = await requirePrincipal("/notices/manage");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const notice = await guard(noticeService().lookupManageable(principal.memberId, id));
  const canGlobal = principal.access.canManageGlobal();
  const allTeams = await memberService().searchTeams();
  const teams = canGlobal ? allTeams : allTeams.filter((t) => t.id === principal.teamId);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">공지 수정</h1>
      <Card>
        <NoticeEditor
          teams={teams}
          allowAll={canGlobal}
          values={{
            noticeId: notice.id,
            targetScope: notice.targetScope,
            teamId: notice.teamId,
            title: notice.title,
            body: notice.body,
            important: notice.important,
            attachments: notice.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType })),
          }}
        />
      </Card>
    </>
  );
}
