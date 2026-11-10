import { ActivityCard } from "@/components/bandi/activity-card";
import { EmptyState } from "@/components/bandi/empty-state";
import { FilterChip } from "@/components/bandi/filter-chip";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL } from "@/features/activity/labels";
import { ACTIVITY_STATUSES, type ActivityStatus } from "@/features/activity/schema";
import { requirePrincipal } from "@/lib/session";
import { ActivityChoice } from "./activity-choice";

export const metadata = { title: "내 활동 기록 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const principal = await requirePrincipal("/activity");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = ACTIVITY_STATUSES.find((s) => s === one(params.status)) as ActivityStatus | undefined;
  const result = await activityService().searchMine(principal.memberId, { status, page });
  const href = (s: ActivityStatus | undefined, p = 1) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/activity?${query}` : "/activity";
  };
  return (
    <>
      <PageHead title="내 활동 기록" description="작성한 활동 기록의 검수 단계와 보완 요청을 확인합니다">
        <ActivityChoice />
      </PageHead>
      <div className="mb-4">
        <h2 className="text-lg font-black">내가 작성한 기록</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">초안부터 최종 승인까지 현재 처리 단계를 확인할 수 있어요.</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href={href(undefined)} label="전체" active={!status} />
        {ACTIVITY_STATUSES.map((s) => (
          <FilterChip key={s} href={href(s)} label={ACTIVITY_STATUS_LABEL[s]} active={status === s} dot={s === "SUBMITTED"} />
        ))}
      </div>
      {result.items.length === 0 ? (
        <div className="rounded-lg border bg-card" role="status">
          <EmptyState title={status ? "조건에 맞는 활동 기록이 없습니다" : "작성한 활동 기록이 없습니다"} message={status ? "다른 상태를 선택해 보세요." : "첫 활동 기록을 작성해 보세요."} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="activity-list">
          {result.items.map((a) => (
            <ActivityCard key={a.id} item={a} href={`/activity/${a.id}`} photoBase="/api/activity-management" mode="mine" />
          ))}
        </div>
      )}
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="내 활동 기록 페이지" hrefFor={(p) => href(status, p)} />
    </>
  );
}
