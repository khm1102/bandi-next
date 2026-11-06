import Link from "next/link";
import { Card } from "@/components/ui";
import { loadDashboard } from "@/features/dashboard/summary";
import { ROLE_LABEL } from "@/features/member/labels";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "홈 · 반디" };

function Stat({ label, value, unit, href, testId }: { label: string; value: number; unit: string; href: string; testId: string }) {
  return (
    <Link href={href} className="block rounded-2xl border bg-card p-4 hover:border-primary">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" data-testid={testId}>
        {value}
        <span className="ml-1 text-sm font-bold text-muted-foreground">{unit}</span>
      </p>
    </Link>
  );
}

export default async function DashboardPage() {
  const principal = await requirePrincipal("/dashboard");
  const data = await loadDashboard(principal);
  return (
    <>
      <div>
        <h1 className="text-2xl font-black tracking-tight">홈</h1>
        <p className="text-sm text-muted-foreground">
          <strong>{principal.name}</strong>님 ({ROLE_LABEL[principal.role]})
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="오늘 일정" value={data.todayEventCount} unit="건" href="/calendar" testId="stat-today" />
        <Stat label="미확인 공지" value={data.unreadNoticeCount} unit="건" href="/notices?unread=1" testId="stat-unread" />
        <Stat label="주의 소품·장비" value={data.cautionAssetCount} unit="건" href="/props" testId="stat-assets" />
      </div>
      {data.revisionRequestedCount > 0 || (data.pendingReviewCount ?? 0) > 0 ? (
        <Card title="확인이 필요한 활동 기록">
          <ul className="space-y-1 text-sm" data-testid="activity-attention">
            {data.revisionRequestedCount > 0 ? (
              <li>
                <Link href="/activity" className="underline">
                  보완 요청된 내 기록 {data.revisionRequestedCount}건
                </Link>
              </li>
            ) : null}
            {(data.pendingReviewCount ?? 0) > 0 ? (
              <li>
                <Link href="/activity/review?status=SUBMITTED" className="underline">
                  검수 대기 {data.pendingReviewCount}건
                </Link>
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="가까운 일정">
          <ul className="space-y-2 text-sm" data-testid="upcoming-events">
            {data.upcoming.length === 0 ? <li className="text-muted-foreground">예정된 일정이 없습니다.</li> : null}
            {data.upcoming.map((event) => (
              <li key={event.id}>
                <strong>{event.title}</strong>
                <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(event.startAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="최신 공지">
          <ul className="space-y-2 text-sm" data-testid="latest-notices">
            {data.latestNotices.length === 0 ? <li className="text-muted-foreground">공지가 없습니다.</li> : null}
            {data.latestNotices.map((notice) => (
              <li key={notice.id}>
                <Link href={`/notices/${notice.id}`} className={notice.isRead ? "text-muted-foreground" : "font-bold"}>
                  {notice.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="최신 자료">
        <ul className="space-y-2 text-sm" data-testid="latest-resources">
          {data.latestResources.length === 0 ? <li className="text-muted-foreground">자료가 없습니다.</li> : null}
          {data.latestResources.map((resource) => (
            <li key={resource.id}>
              <Link href={`/resources/${resource.id}`} className="font-bold">
                {resource.title}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">{resource.createdByName}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
