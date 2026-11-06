import { Card } from "@/components/ui";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL } from "@/features/member/labels";
import { requireRole } from "@/lib/session";
import { MemberTeamForm } from "./member-team-form";

export const metadata = { title: "팀 멤버 · 반디" };

export default async function TeamMembersPage() {
  // 현행 정책 유지: 팀장 전용 (ADMIN은 /members 에서 전체를 관리한다).
  const principal = await requireRole("LEADER");
  const service = memberService();
  const [members, teams, cohorts] = await Promise.all([
    service.searchTeamMembers(principal.memberId),
    service.searchTeams(),
    service.searchCohorts(),
  ]);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">팀 멤버</h1>
      <Card>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="space-y-3 py-4">
              <p className="text-sm">
                <strong>{m.name}</strong> · {m.studentNo} · {ROLE_LABEL[m.role]}
                {m.phoneNumber ? ` · ${m.phoneNumber}` : ""}
              </p>
              <MemberTeamForm memberId={m.id} teams={teams} cohorts={cohorts} teamId={m.teamId} cohortId={m.cohortId} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
