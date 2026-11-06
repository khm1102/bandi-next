import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { MEMBER_STATUSES, ROLES } from "@/features/member/codes";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL, STATUS_LABEL } from "@/features/member/labels";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";
import { MemberAdminForms } from "./member-admin-forms";

export const metadata = { title: "멤버 상세 · 반디" };

export default async function MemberDetailPage({ params }: PageProps<"/members/[id]">) {
  const principal = await requireRole("ADMIN");
  const memberId = Number((await params).id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    notFound();
  }
  const service = memberService();
  const data = await guard(
    Promise.all([
      service.lookupMemberForManager(principal.memberId, memberId),
      service.searchHistories(principal.memberId, memberId),
      service.searchTeams(false),
      service.searchCohorts(false),
    ]),
  );
  const [member, histories, teams, cohorts] = data;
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">{member.name}</h1>
      <Card>
        <p className="text-sm">
          {member.studentNo} · {ROLE_LABEL[member.role]} · {STATUS_LABEL[member.status]} · 휴대폰{" "}
          {member.phoneNumber ?? "-"}
        </p>
      </Card>
      <MemberAdminForms
        member={{ id: member.id, teamId: member.teamId, cohortId: member.cohortId, role: member.role, status: member.status }}
        teams={teams}
        cohorts={cohorts}
        roles={[...ROLES]}
        statuses={[...MEMBER_STATUSES]}
        roleLabels={ROLE_LABEL}
        statusLabels={STATUS_LABEL}
      />
      <Card title="변경 이력">
        <ul className="space-y-2 text-sm" data-testid="history-list">
          {histories.length === 0 ? <li className="text-muted-foreground">이력이 없습니다.</li> : null}
          {histories.map((h) => (
            <li key={h.id}>
              {formatDateTime(h.changedAt)} · {h.field} {h.oldValue} → {h.newValue} · {h.reason}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
