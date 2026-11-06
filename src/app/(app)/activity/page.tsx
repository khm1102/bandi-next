import Link from "next/link";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { ACTIVITY_STATUS_LABEL } from "@/features/activity/labels";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "활동 기록 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const principal = await requirePrincipal("/activity");
  const page = Math.max(1, Number((one((await searchParams).page))) || 1);
  const result = await activityService().searchMine(principal.memberId, { page });
  const isManager = principal.access.canManageGlobal() || (principal.access.leader && principal.access.active);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">내 활동 기록</h1>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <Link href="/activity/new" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary-strong">
            간단 기록 작성
          </Link>
          <Link href="/activity-documents" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 hover:bg-secondary">
            활동 내역서(HWPX)
          </Link>
          <Link href="/activity/archive" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 hover:bg-secondary">
            보관함
          </Link>
          {isManager ? (
            <Link href="/activity/review" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 hover:bg-secondary">
              검수
            </Link>
          ) : null}
        </div>
      </div>
      <Card>
        <ul className="divide-y divide-border" data-testid="activity-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">활동 기록이 없습니다.</li> : null}
          {result.items.map((a) => (
            <li key={a.id} className="py-3">
              <Link href={`/activity/${a.id}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{ACTIVITY_STATUS_LABEL[a.status]}</span>
                <span className="font-bold">{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {a.teamName} · {formatDateTime(a.activityAt)} · {a.participantCount}명
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
