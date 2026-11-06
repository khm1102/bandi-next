import Link from "next/link";
import { Card } from "@/components/ui";
import { noticeService } from "@/features/notice/instance";
import { NOTICE_SCOPES, type NoticeScope } from "@/features/notice/schema";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "공지 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NoticesPage({ searchParams }: PageProps<"/notices">) {
  const principal = await requirePrincipal("/notices");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const unreadOnly = one(params.unread) === "1";
  const scope = NOTICE_SCOPES.find((s) => s === one(params.scope)) as NoticeScope | undefined;
  const result = await noticeService().searchReadable(principal.memberId, { keyword, unreadOnly, scope, page });
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const qs = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (unreadOnly) q.set("unread", "1");
    if (scope) q.set("scope", scope);
    q.set("page", String(p));
    return `/notices?${q.toString()}`;
  };
  const canManage = principal.access.canManageGlobal() || (principal.access.leader && principal.access.active);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">공지</h1>
        {canManage ? (
          <Link href="/notices/manage" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
            공지 관리
          </Link>
        ) : null}
      </div>
      <form action="/notices" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={keyword} placeholder="제목·본문 검색" className="rounded-md border border-input bg-card px-3 py-2" />
        <select name="scope" defaultValue={scope ?? ""} className="rounded-md border border-input bg-card px-3 py-2" aria-label="대상">
          <option value="">전체 대상</option>
          <option value="ALL">전체 공지</option>
          <option value="TEAM">팀 공지</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} /> 안 읽은 공지만
        </label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="notice-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">공지가 없습니다.</li> : null}
          {result.items.map((n) => (
            <li key={n.id} className="py-3">
              <Link href={`/notices/${n.id}`} className="flex flex-wrap items-center gap-2">
                {n.important ? <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-bold text-destructive">중요</span> : null}
                <span className={n.isRead ? "text-muted-foreground" : "font-bold"}>{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.teamName ?? "전체"} · {n.createdByName} · {formatDateTime(n.publishStartAt)}
                  {n.isRead ? "" : " · 안 읽음"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? <Link href={qs(page - 1)}>이전</Link> : null}
          <span>
            {page} / {lastPage}
          </span>
          {page < lastPage ? <Link href={qs(page + 1)}>다음</Link> : null}
        </nav>
      </Card>
    </>
  );
}
