import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { EmptyState } from "@/components/bandi/empty-state";
import { PageHead } from "@/components/bandi/page-head";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL } from "@/features/member/labels";
import { requireRole } from "@/lib/session";
import { MemberTeamForm } from "./member-team-form";

export const metadata = { title: "팀 멤버 관리 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TeamMembersPage({ searchParams }: PageProps<"/team-members">) {
  // 현행 정책 유지: 팀장 전용 (ADMIN은 /members 에서 전체를 관리한다).
  const principal = await requireRole("LEADER");
  const keyword = (one((await searchParams).q) ?? "").trim();
  const service = memberService();
  const [all, teams, cohorts] = await Promise.all([service.searchTeamMembers(principal.memberId), service.searchTeams(), service.searchCohorts()]);
  const members = keyword ? all.filter((m) => m.name.includes(keyword) || m.studentNo.includes(keyword)) : all;
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const cohortName = new Map((await service.searchCohorts(false)).map((c) => [c.id, c.name]));
  return (
    <>
      <PageHead title="팀 멤버 관리" description="현재 소속 팀 멤버의 소속 팀과 기수를 관리할 수 있어요." />
      <form action="/team-members" className="mb-4 grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3">
        <LiveSearch defaultValue={keyword} className="min-h-11 rounded-md border border-input bg-card px-3 text-sm" placeholder="이름 또는 학번으로 검색" aria-label="팀 멤버 검색" />
        {keyword ? <Link href="/team-members" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold md:col-span-3 md:justify-self-start">필터 초기화</Link> : null}
      </form>
      {members.length === 0 ? (
        <div className="rounded-lg border bg-card"><EmptyState title={keyword ? "조건에 맞는 팀 멤버가 없습니다" : "팀 멤버가 없습니다"} message={keyword ? "검색어를 바꿔 보세요." : "활동 중인 팀 멤버가 표시됩니다."} /></div>
      ) : (
        <div className="divide-y rounded-lg border bg-card" data-testid="team-member-list">
          {members.map((m) => (
            <article key={m.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-extrabold">{m.name.slice(0, 1)}</span>
                <div className="min-w-0">
                  <b className="block truncate text-sm">{m.name}</b>
                  <span className="mt-1 block text-xs text-muted-foreground">{m.studentNo} · {ROLE_LABEL[m.role]}</span>
                  {m.phoneNumber ? <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{m.phoneNumber}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">{teamName.get(m.teamId) ?? "-"}</span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">{cohortName.get(m.cohortId) ?? "-"}</span>
                <MemberTeamForm memberId={m.id} name={m.name} teams={teams} cohorts={cohorts} teamId={m.teamId} cohortId={m.cohortId} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
