import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { Badge } from "@/components/bandi/badge";
import { Button } from "@/components/bandi/button";
import { EmptyState } from "@/components/bandi/empty-state";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUS_TONE, RECORD_TYPE_LABEL } from "@/features/activity/labels";
import { ACTIVITY_STATUSES, type ActivityStatus } from "@/features/activity/schema";
import { memberService } from "@/features/member/instance";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata = { title: "활동 기록 검수 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";
const OPEN = "inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-bold hover:bg-secondary";

export default async function ReviewListPage({ searchParams }: PageProps<"/activity/review">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = ACTIVITY_STATUSES.find((s) => s === one(params.status)) as ActivityStatus | undefined;
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;
  const recordType = one(params.type) === "SIMPLE" || one(params.type) === "HWPX" ? (one(params.type) as "SIMPLE" | "HWPX") : undefined;
  const isAdmin = principal.access.canManageGlobal();
  const [result, teams] = await Promise.all([
    activityService().searchReview(principal.memberId, { status, keyword, teamId, recordType, page }),
    memberService().searchTeams(),
  ]);
  const query = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (keyword) q.set("q", keyword);
    if (teamId) q.set("teamId", String(teamId));
    if (recordType) q.set("type", recordType);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q.toString();
  };
  const href = (p: number) => `/activity/review${query(p > 1 ? { page: String(p) } : {}) ? `?${query(p > 1 ? { page: String(p) } : {})}` : ""}`;
  const filtered = Boolean(status || keyword || teamId || recordType);

  return (
    <>
      <PageHead title="활동 기록 검수" description="제출된 기록을 확인하고 팀장 승인과 최종 승인을 처리합니다.">
        {isAdmin ? <Button variant="outline" href={`/api/activity-reviews/export?${query()}`}>CSV 내보내기</Button> : null}
      </PageHead>

      <form action="/activity/review" className="rounded-lg border bg-card p-4" aria-label="검수 기록 필터">
        <div className={`grid gap-3 ${isAdmin ? "lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]" : "lg:grid-cols-[minmax(0,1fr)_12rem_12rem]"} lg:items-end`}>
          <div>
            <label className={LABEL} htmlFor="reviewKeyword">제목 검색</label>
            <LiveSearch id="reviewKeyword" defaultValue={keyword} maxLength={150} placeholder="활동 기록 제목으로 검색" className={SELECT} />
          </div>
          <div>
            <label className={LABEL} htmlFor="reviewStatus">검수 상태</label>
            <AutoSubmitSelect id="reviewStatus" name="status" defaultValue={status ?? ""} className={SELECT}>
              <option value="">전체 상태</option>
              {ACTIVITY_STATUSES.filter((s) => s !== "DRAFT").map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_LABEL[s]}</option>)}
            </AutoSubmitSelect>
          </div>
          <div>
            <label className={LABEL} htmlFor="reviewType">기록 형식</label>
            <AutoSubmitSelect id="reviewType" name="type" defaultValue={recordType ?? ""} className={SELECT}>
              <option value="">전체 형식</option>
              <option value="SIMPLE">간단 기록</option>
              <option value="HWPX">한글 내역서</option>
            </AutoSubmitSelect>
          </div>
          {isAdmin ? (
            <div>
              <label className={LABEL} htmlFor="reviewTeam">팀</label>
              <AutoSubmitSelect id="reviewTeam" name="teamId" defaultValue={teamId ?? ""} className={SELECT}>
                <option value="">전체 팀</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </AutoSubmitSelect>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{isAdmin ? "운영진은 모든 팀의 제출 기록을 검수할 수 있어요." : "팀장은 현재 소속 팀의 기록만 검수할 수 있어요."}</p>
      </form>

      <section className="mt-5" aria-labelledby="reviewListTitle">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="reviewListTitle" className="text-lg font-black">검수 기록</h2>
          <p className="text-xs text-muted-foreground">총 {result.total.toLocaleString("ko-KR")}건</p>
        </div>
        {result.items.length === 0 ? (
          <div className="rounded-lg border bg-card" role="status">
            <EmptyState title={filtered ? "조건에 맞는 검수 기록이 없습니다" : "검수할 기록이 없습니다"} message={filtered ? "조건을 바꾸거나 초기화해 보세요." : "제출된 활동 기록이 생기면 이곳에 표시됩니다."} />
          </div>
        ) : (
          <div data-testid="review-list">
            <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead className="border-b bg-secondary/70 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-extrabold">기록</th>
                    <th className="px-4 py-3 font-extrabold">팀</th>
                    <th className="px-4 py-3 font-extrabold">작성자</th>
                    <th className="px-4 py-3 font-extrabold">활동 일시</th>
                    <th className="px-4 py-3 font-extrabold">현재 단계</th>
                    <th className="px-4 py-3 text-right font-extrabold">검수</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{RECORD_TYPE_LABEL[a.recordType]}</Badge>
                          <Badge tone={ACTIVITY_STATUS_TONE[a.status]}>{ACTIVITY_STATUS_LABEL[a.status]}</Badge>
                        </div>
                        <b className="mt-2 block">{a.title}</b>
                        <span className="mt-1 block text-xs text-muted-foreground">{RECORD_TYPE_LABEL[a.recordType]}</span>
                      </td>
                      <td className="px-4 py-3">{a.teamName || "팀 미정"}</td>
                      <td className="px-4 py-3">{a.authorName || "작성자 미상"}</td>
                      <td className="px-4 py-3 tabular-nums">{formatDateTime(a.activityAt)}</td>
                      <td className="px-4 py-3"><Badge tone={ACTIVITY_STATUS_TONE[a.status]}>{ACTIVITY_STATUS_LABEL[a.status]}</Badge></td>
                      <td className="px-4 py-3 text-right"><Link className={OPEN} href={`/activity/review/${a.id}`}>검수 열기</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {result.items.map((a) => (
                <article key={a.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{RECORD_TYPE_LABEL[a.recordType]}</Badge>
                    <Badge tone={ACTIVITY_STATUS_TONE[a.status]}>{ACTIVITY_STATUS_LABEL[a.status]}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-black">{a.title}</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt className="text-muted-foreground">팀</dt><dd className="mt-0.5">{a.teamName || "팀 미정"}</dd></div>
                    <div><dt className="text-muted-foreground">작성자</dt><dd className="mt-0.5">{a.authorName || "작성자 미상"}</dd></div>
                    <div className="col-span-2"><dt className="text-muted-foreground">활동 일시</dt><dd className="mt-0.5 tabular-nums">{formatDateTime(a.activityAt)}</dd></div>
                  </dl>
                  <Link className={`mt-4 ${OPEN}`} href={`/activity/review/${a.id}`}>검수 열기</Link>
                </article>
              ))}
            </div>
          </div>
        )}
        <Pagination page={page} total={result.total} pageSize={result.pageSize} label="활동 기록 검수 페이지" hrefFor={href} />
      </section>
    </>
  );
}
