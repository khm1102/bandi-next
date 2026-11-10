import { LiveSearch } from "@/components/bandi/live-search";
import { ActivityCard } from "@/components/bandi/activity-card";
import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { EmptyState } from "@/components/bandi/empty-state";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { activityService } from "@/features/activity/instance";
import { memberService } from "@/features/member/instance";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "승인 활동 기록 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";

export default async function ArchivePage({ searchParams }: PageProps<"/activity/archive">) {
  const principal = await requirePrincipal("/activity/archive");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;
  const recordType = one(params.type) === "SIMPLE" || one(params.type) === "HWPX" ? (one(params.type) as "SIMPLE" | "HWPX") : undefined;
  const [result, teams] = await Promise.all([
    activityService().searchArchive(principal.memberId, { keyword, teamId, recordType, page }),
    memberService().searchTeams(),
  ]);
  const filtered = Boolean(keyword || teamId || recordType);
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (teamId) q.set("teamId", String(teamId));
    if (recordType) q.set("type", recordType);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/activity/archive?${query}` : "/activity/archive";
  };
  return (
    <>
      <PageHead title="승인 활동 기록" description="최종 승인된 동아리 활동 기록을 확인할 수 있어요." />
      <form action="/activity/archive" className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <div>
            <label className={LABEL} htmlFor="archiveKeyword">검색</label>
            <LiveSearch id="archiveKeyword" defaultValue={keyword} maxLength={150} placeholder="제목 또는 작성자로 검색" className={SELECT} />
          </div>
          <div>
            <label className={LABEL} htmlFor="archiveTeam">팀</label>
            <AutoSubmitSelect id="archiveTeam" name="teamId" defaultValue={teamId ?? ""} className={SELECT}>
              <option value="">전체 팀</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </AutoSubmitSelect>
          </div>
          <div>
            <label className={LABEL} htmlFor="archiveType">형식</label>
            <AutoSubmitSelect id="archiveType" name="type" defaultValue={recordType ?? ""} className={SELECT}>
              <option value="">전체 형식</option>
              <option value="SIMPLE">간단 기록</option>
              <option value="HWPX">한글 내역서</option>
            </AutoSubmitSelect>
          </div>
        </div>
      </form>
      <section className="mt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-black">전체 기록</h2>
          <p className="text-xs text-muted-foreground">총 {result.total.toLocaleString("ko-KR")}건</p>
        </div>
        {result.items.length === 0 ? (
          <div className="rounded-lg border bg-card" role="status">
            <EmptyState title="승인된 활동 기록이 없습니다" message={filtered ? "조건을 바꾸거나 초기화해 보세요." : "최종 승인된 기록이 생기면 이곳에서 볼 수 있어요."} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="archive-list">
            {result.items.map((a) => (
              <ActivityCard key={a.id} item={a} href={`/activity/archive/${a.id}`} photoBase="/api/activity-records" mode="archive" />
            ))}
          </div>
        )}
        <Pagination page={page} total={result.total} pageSize={result.pageSize} label="승인 활동 기록 페이지" hrefFor={href} />
      </section>
    </>
  );
}
