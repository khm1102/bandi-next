import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { changeTeamAction } from "@/features/member/actions";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL, STATUS_LABEL } from "@/features/member/labels";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "내 프로필 · 반디" };

export default async function ProfilePage() {
  const principal = await requirePrincipal("/profile");
  const service = memberService();
  const [profile, teams, cohorts] = await Promise.all([
    service.lookupProfile(principal.memberId),
    service.searchTeams(),
    service.searchCohorts(false),
  ]);
  const teamName = teams.find((team) => team.id === profile.teamId)?.name ?? "-";
  const cohortName = cohorts.find((cohort) => cohort.id === profile.cohortId)?.name ?? "-";
  const rows: [string, string][] = [
    ["이름", profile.name],
    ["학번", profile.studentNo],
    ["학과", profile.department ?? "-"],
    ["기수", cohortName],
    ["팀", teamName],
    ["권한", ROLE_LABEL[profile.role]],
    ["상태", STATUS_LABEL[profile.status]],
    ["휴대폰", profile.phoneNumber ?? "-"],
    ["마지막 로그인", formatDateTime(profile.lastLoginAt)],
  ];
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">내 프로필</h1>
      <Card>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="팀 변경">
        <ActionForm action={changeTeamAction} submitLabel="팀 변경">
          <input type="hidden" name="memberId" value={profile.id} />
          <Field label="새 팀">
            <select name="newTeamId" defaultValue={profile.teamId} className={inputClass}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="변경 사유">
            <input name="reason" required maxLength={500} className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
