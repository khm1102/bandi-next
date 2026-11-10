import { PageHead } from "@/components/bandi/page-head";
import { ActionForm } from "@/components/ui";
import { changeCohortAction, changeTeamAction } from "@/features/member/actions";
import { memberService } from "@/features/member/instance";
import { ACADEMIC_LABEL, ROLE_LABEL, SSO_LABEL } from "@/features/member/labels";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";
import { ProfilePhoto } from "./profile-photo";

export const metadata = { title: "내 프로필 · 반디" };

const SELECT = "mt-2 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const ROW = "grid grid-cols-[7rem_1fr] gap-3 py-3 text-sm";

export default async function ProfilePage() {
  const principal = await requirePrincipal("/profile");
  const service = memberService();
  const [profile, teams, cohorts, activeCohorts] = await Promise.all([service.lookupProfile(principal.memberId), service.searchTeams(), service.searchCohorts(false), service.searchCohorts(true)]);
  const teamName = teams.find((team) => team.id === profile.teamId)?.name ?? "-";
  const cohortName = cohorts.find((cohort) => cohort.id === profile.cohortId)?.name ?? "-";
  const basics: [string, string, string?][] = [
    ["이름", profile.name, "font-semibold"],
    ["학번", profile.studentNo, "font-semibold tabular-nums"],
    ["기수", cohortName],
    ["현재 팀", teamName],
    ["역할", ROLE_LABEL[profile.role]],
  ];
  const sso: [string, string, string?][] = [
    ["학과", profile.department ?? "-"],
    ["휴대폰", profile.phoneNumber ?? "-", "tabular-nums"],
    ["학적", profile.academicStatus ? (ACADEMIC_LABEL[profile.academicStatus] ?? profile.academicStatus) : "-"],
    ["SSO 연결", SSO_LABEL[profile.ssoLinkStatus] ?? profile.ssoLinkStatus],
    ["마지막 확인", formatDateTime(profile.academicStatusVerifiedAt), "tabular-nums"],
    ["마지막 로그인", formatDateTime(profile.lastLoginAt), "tabular-nums"],
  ];
  return (
    <>
      <PageHead title="내 프로필" description="학교 SSO에서 확인한 정보와 동아리 소속을 확인합니다." />
      <div className="flex flex-col gap-6">
        <ProfilePhoto memberId={profile.id} name={profile.name} hasPhoto={profile.profilePhotoFileId !== null} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div>
            <h2 className="text-lg font-extrabold">기본 정보</h2>
            <dl className="mt-4 divide-y border-y">
              {basics.map(([label, value, cls]) => (
                <div key={label} className={ROW}>
                  <dt className="font-bold text-muted-foreground">{label}</dt>
                  <dd className={cls}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <section aria-labelledby="profileTeamTitle">
              <h2 id="profileTeamTitle" className="text-lg font-extrabold">소속 팀 변경</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">변경 즉시 반영되며 사유와 변경 이력이 남아요.</p>
            <ActionForm action={changeTeamAction} submitLabel="소속 팀 변경" className="mt-4">
              <input type="hidden" name="memberId" value={profile.id} />
              <label className="block text-sm font-bold" htmlFor="profileTeam">새 소속 팀</label>
              <select id="profileTeam" name="newTeamId" defaultValue={profile.teamId} required className={SELECT}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
              <label className="mt-4 block text-sm font-bold" htmlFor="profileTeamReason">변경 사유</label>
              <textarea id="profileTeamReason" name="reason" required maxLength={500} placeholder="예) 이번 학기 팀 이동" className="mt-2 mb-3 min-h-28 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm" />
            </ActionForm>
            </section>
            <section className="mt-6 border-t pt-5" aria-labelledby="profileCohortTitle">
              <h2 id="profileCohortTitle" className="text-lg font-extrabold">기수 변경</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">기수가 잘못 등록됐다면 직접 정정할 수 있어요. 사유와 변경 이력이 남아요.</p>
              <ActionForm action={changeCohortAction} submitLabel="기수 변경" className="mt-4">
                <input type="hidden" name="memberId" value={profile.id} />
                <label className="block text-sm font-bold" htmlFor="profileCohort">새 기수</label>
                <select id="profileCohort" name="newCohortId" defaultValue={profile.cohortId} required className={SELECT}>
                  {activeCohorts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {activeCohorts.some((c) => c.id === profile.cohortId) ? null : <option value={profile.cohortId}>{cohortName} (현재)</option>}
                </select>
                <label className="mt-4 block text-sm font-bold" htmlFor="profileCohortReason">변경 사유</label>
                <textarea id="profileCohortReason" name="reason" required maxLength={500} placeholder="예) 입부 기수 정정" className="mt-2 mb-3 min-h-28 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm" />
              </ActionForm>
            </section>
          </div>
        </div>

        <section className="border-t pt-6" aria-labelledby="profileSsoTitle">
          <h2 id="profileSsoTitle" className="text-lg font-extrabold">학교 SSO 정보</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">학교에서 확인한 정보예요. 직접 수정할 수 없고 다음 로그인 때 갱신돼요.</p>
          <dl className="mt-4 grid gap-x-8 border-y sm:grid-cols-2">
            {sso.map(([label, value, cls]) => (
              <div key={label} className={ROW}>
                <dt className="font-bold text-muted-foreground">{label}</dt>
                <dd className={cls}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
