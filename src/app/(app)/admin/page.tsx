import { Card } from "@/components/bandi/card";
import { StatCard } from "@/components/bandi/stat-card";
import { adminService } from "@/features/admin/instance";
import { ASSET_STATUS_LABEL } from "@/features/asset/labels";
import { STATUS_LABEL } from "@/features/member/labels";
import { MEMBER_STATUSES } from "@/features/member/codes";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";

export const metadata = { title: "운영 관리 · 반디" };

// 검증기를 통과한 2계열 색 (dataviz validate_palette: 명도·채도·색각 구분·대비 모두 PASS).
const SUBMITTED = "#2b6cb0";
const APPROVED = "#b3263a";
const DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

const monthLabel = (month: string) => `${Number(month.slice(5))}월`;

export default async function AdminStatsPage() {
  const principal = await requireRole("ADMIN");
  const stats = await guard(adminService().stats(principal.memberId));
  const thisMonth = stats.monthlyActivity.at(-1) ?? { month: "", submitted: 0, approved: 0 };
  const monthMax = Math.max(1, ...stats.monthlyActivity.flatMap((m) => [m.submitted, m.approved]));
  const teamMax = Math.max(1, ...stats.activeByTeam.map((t) => t.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <StatCard label="활동 중 멤버" value={stats.activeMembers} unit="명" icon="members" featured testId="stat-active-members" />
        <StatCard label="사전 등록 (첫 로그인 전)" value={stats.membersByStatus.PRE_REGISTERED} unit="명" icon="clock" iconTone="info" />
        <StatCard label="이번 달 제출 기록" value={thisMonth.submitted} unit="건" icon="activity" />
        <StatCard label="이번 달 최종 승인" value={thisMonth.approved} unit="건" icon="check" iconTone="info" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="월별 활동 기록" icon="chart">
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: SUBMITTED }} />제출(초안 제외)</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: APPROVED }} />최종 승인</span>
          </div>
          <div className="relative" role="img" aria-label={`최근 6개월 활동 기록: ${stats.monthlyActivity.map((m) => `${monthLabel(m.month)} 제출 ${m.submitted}건 승인 ${m.approved}건`).join(", ")}`}>
            <span className="absolute left-0 top-0 text-[0.65rem] text-muted-foreground">{monthMax}건</span>
            <div className="flex h-48 items-end gap-2 border-b pl-8">
              {stats.monthlyActivity.map((m) => (
                <div key={m.month} className="group relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm outline-none hover:bg-secondary/60 focus-visible:bg-secondary/60" tabIndex={0}>
                  {[{ value: m.submitted, color: SUBMITTED }, { value: m.approved, color: APPROVED }].map((bar, i) => (
                    <span key={i} className="w-full max-w-6 rounded-t" style={{ height: `${(bar.value / monthMax) * 100}%`, minHeight: bar.value > 0 ? 2 : 0, backgroundColor: bar.color }} />
                  ))}
                  <span className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus-visible:block">
                    <b className="block">{m.month.replace("-", "년 ")}월</b>
                    제출 {m.submitted}건 · 승인 {m.approved}건
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2 pl-8 text-center text-xs text-muted-foreground">
              {stats.monthlyActivity.map((m) => <span key={m.month} className="flex-1">{monthLabel(m.month)}</span>)}
            </div>
          </div>
          <details className="mt-4 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-bold text-accent-foreground">표로 보기</summary>
            <table className="mt-2 w-full text-left" data-testid="monthly-table">
              <thead className="border-b text-xs text-muted-foreground"><tr><th className="py-2">월</th><th className="py-2 text-right">제출</th><th className="py-2 text-right">최종 승인</th></tr></thead>
              <tbody>
                {stats.monthlyActivity.map((m) => (
                  <tr key={m.month} className="border-b last:border-b-0"><td className="py-2">{m.month}</td><td className="py-2 text-right tabular-nums">{m.submitted}</td><td className="py-2 text-right tabular-nums">{m.approved}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card title="팀별 활동 중 멤버" icon="team">
          <ul className="flex flex-col gap-2" data-testid="team-members-chart">
            {stats.activeByTeam.map((t) => (
              <li key={t.teamId} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-sm" title={`${t.teamName} ${t.count}명`}>
                <span className="truncate text-xs font-bold text-muted-foreground">{t.teamName}</span>
                <span className="h-5 rounded-r bg-secondary/60">
                  <span className="block h-full rounded-r" style={{ width: `${(t.count / teamMax) * 100}%`, minWidth: t.count > 0 ? 3 : 0, backgroundColor: APPROVED }} />
                </span>
                <span className="text-right text-xs font-bold tabular-nums">{t.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card title="최근 공지 확인률" icon="bell">
          {stats.recentNotices.length === 0 ? (
            <p className="text-sm text-muted-foreground">게시된 공지가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="notice-read-rates">
              {stats.recentNotices.map((n) => {
                const rate = n.targets > 0 ? Math.round((n.readers / n.targets) * 100) : 0;
                return (
                  <li key={n.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <a href={`/notices/manage/${n.id}`} className="min-w-0 truncate font-bold hover:underline">{n.title}</a>
                      <span className="shrink-0 text-xs font-bold tabular-nums">{rate}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-secondary" aria-hidden="true">
                      <div className="h-full rounded-full" style={{ width: `${rate}%`, backgroundColor: APPROVED }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{n.readers} / {n.targets}명 확인{n.publishStartAt ? ` · ${DATE.format(n.publishStartAt)} 게시` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="멤버 상태" icon="members">
          <dl className="divide-y text-sm">
            {MEMBER_STATUSES.map((s) => (
              <div key={s} className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">{STATUS_LABEL[s]}</dt>
                <dd className="font-bold tabular-nums">{stats.membersByStatus[s]}명</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="소품·장비 상태" icon="box">
          <dl className="divide-y text-sm">
            {Object.keys(ASSET_STATUS_LABEL).map((s) => (
              <div key={s} className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">{ASSET_STATUS_LABEL[s]}</dt>
                <dd className="font-bold tabular-nums">{stats.assetsByStatus[s] ?? 0}개</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
