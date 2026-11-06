import Link from "next/link";
import { Card } from "@/components/ui";
import { noticeService } from "@/features/notice/instance";
import { STATUS_LABEL } from "@/features/notice/labels";
import { NOTICE_STATUSES, type NoticeStatus } from "@/features/notice/schema";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata = { title: "공지 관리 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ManageNoticesPage({ searchParams }: PageProps<"/notices/manage">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = NOTICE_STATUSES.find((s) => s === one(params.status)) as NoticeStatus | undefined;
  const keyword = one(params.q) ?? "";
  const result = await noticeService().searchManageable(principal.memberId, { keyword, status, page });
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">공지 관리</h1>
        <Link href="/notices/write" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
          공지 작성
        </Link>
      </div>
      <form action="/notices/manage" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={keyword} placeholder="제목·본문 검색" className="rounded-md border border-input bg-card px-3 py-2" />
        <select name="status" defaultValue={status ?? ""} aria-label="상태" className="rounded-md border border-input bg-card px-3 py-2">
          <option value="">전체 상태</option>
          {NOTICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="manage-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">공지가 없습니다.</li> : null}
          {result.items.map((n) => (
            <li key={n.id} className="py-3">
              <Link href={`/notices/manage/${n.id}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{STATUS_LABEL[n.status]}</span>
                <span className="font-bold">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.teamName ?? "전체"} · {n.createdByName} · {formatDateTime(n.publishStartAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {page} / {lastPage} 페이지 · 총 {result.total}건
        </p>
      </Card>
    </>
  );
}
