import Link from "next/link";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL } from "@/features/activity/labels";
import { ACTIVITY_STATUSES, type ActivityStatus } from "@/features/activity/schema";
import { memberService } from "@/features/member/instance";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata = { title: "활동 기록 검수 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReviewListPage({ searchParams }: PageProps<"/activity/review">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = ACTIVITY_STATUSES.find((s) => s === one(params.status)) as ActivityStatus | undefined;
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;
  const [result, teams] = await Promise.all([
    activityService().searchReview(principal.memberId, { status, keyword, teamId, page }),
    memberService().searchTeams(),
  ]);
  const csvQuery = new URLSearchParams({ ...(status ? { status } : {}), ...(keyword ? { q: keyword } : {}), ...(teamId ? { teamId: String(teamId) } : {}) });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">활동 기록 검수</h1>
        {principal.access.canManageGlobal() ? (
          <a href={`/api/activity-reviews/export?${csvQuery}`} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
            CSV 내려받기
          </a>
        ) : null}
      </div>
      <form action="/activity/review" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={keyword} placeholder="제목·작성자" className="rounded-md border border-input bg-card px-3 py-2" />
        <select name="status" defaultValue={status ?? ""} aria-label="상태" className="rounded-md border border-input bg-card px-3 py-2">
          <option value="">전체 상태</option>
          {ACTIVITY_STATUSES.filter((s) => s !== "DRAFT").map((s) => (
            <option key={s} value={s}>
              {ACTIVITY_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {principal.access.canManageGlobal() ? (
          <select name="teamId" defaultValue={teamId ?? ""} aria-label="팀" className="rounded-md border border-input bg-card px-3 py-2">
            <option value="">전체 팀</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="review-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">검수할 기록이 없습니다.</li> : null}
          {result.items.map((a) => (
            <li key={a.id} className="py-3">
              <Link href={`/activity/review/${a.id}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{ACTIVITY_STATUS_LABEL[a.status]}</span>
                <span className="font-bold">{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {a.teamName} · {a.authorName} · {formatDateTime(a.activityAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 페이지 · 총 {result.total}건
        </p>
      </Card>
    </>
  );
}
