import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { Button } from "@/components/bandi/button";
import { EmptyState } from "@/components/bandi/empty-state";
import { FilterChip } from "@/components/bandi/filter-chip";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { noticeService } from "@/features/notice/instance";
import { NOTICE_SCOPES, type NoticeScope } from "@/features/notice/schema";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "공지 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const KO_DATETIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

export default async function NoticesPage({ searchParams }: PageProps<"/notices">) {
  const principal = await requirePrincipal("/notices");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const unreadOnly = one(params.unread) === "1";
  const scope = NOTICE_SCOPES.find((s) => s === one(params.scope)) as NoticeScope | undefined;
  const result = await noticeService().searchReadable(principal.memberId, { keyword, unreadOnly, scope, page });
  const href = (next: { unread?: boolean; scope?: NoticeScope; page?: number }) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    const u = "unread" in next ? next.unread : unreadOnly;
    const s = "scope" in next ? next.scope : scope;
    if (u) q.set("unread", "1");
    if (s) q.set("scope", s);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const query = q.toString();
    return query ? `/notices?${query}` : "/notices";
  };
  const canManage = principal.access.canManageGlobal() || (principal.access.leader && principal.access.active);
  const filtered = Boolean(keyword || unreadOnly || scope);

  return (
    <>
      <PageHead title="공지" description="전체 공지와 내 팀 공지를 확인하세요.">
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" href="/notices/manage">공지 관리</Button>
            <Button href="/notices/write">공지 작성</Button>
          </div>
        ) : null}
      </PageHead>
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <form action="/notices" className="flex min-w-0 flex-1">
          {unreadOnly ? <input type="hidden" name="unread" value="1" /> : null}
          {scope ? <input type="hidden" name="scope" value={scope} /> : null}
          <LiveSearch className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" defaultValue={keyword} placeholder="제목과 내용으로 검색" aria-label="공지 검색" />
        </form>
        <div className="flex flex-wrap gap-2" aria-label="공지 필터">
          <FilterChip href={href({ unread: false, page: 1 })} label="전체" active={!unreadOnly} />
          <FilterChip href={href({ unread: true, page: 1 })} label="미확인" dot active={unreadOnly} />
          <FilterChip href={href({ scope: undefined, page: 1 })} label="전체 범위" active={!scope} />
          <FilterChip href={href({ scope: "TEAM", page: 1 })} label="팀 공지" active={scope === "TEAM"} />
        </div>
      </div>
      <section className="rounded-lg border bg-card" aria-live="polite">
        {result.items.length === 0 ? (
          <EmptyState title={filtered ? "조건에 맞는 공지가 없습니다" : "등록된 공지가 없습니다"} message={filtered ? "검색어나 필터를 바꿔 보세요." : "새 공지가 게시되면 이곳에 표시됩니다."}>
            {filtered ? <Button variant="outline" href="/notices">필터 초기화</Button> : null}
          </EmptyState>
        ) : (
          <div className="divide-y" data-testid="notice-list">
            {result.items.map((n) => (
              <Link key={n.id} href={`/notices/${n.id}`} className="block px-5 py-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <div className="flex flex-wrap items-center gap-2">
                  {n.important ? <span className="rounded-full bg-warning-soft px-2 py-1 text-xs font-bold text-warning">중요</span> : null}
                  <span className="rounded-full bg-info-soft px-2 py-1 text-xs font-bold text-info">{n.targetScope === "TEAM" ? n.teamName || "팀 공지" : "전체 공지"}</span>
                  {!n.isRead ? <span className="rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-foreground">미확인</span> : null}
                </div>
                <b className="mt-2 block text-sm">{n.title}</b>
                <span className="mt-1 block text-xs text-muted-foreground">
                  작성 {n.createdByName} · {n.publishStartAt ? KO_DATETIME.format(n.publishStartAt) : "게시일 미정"} 게시
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="공지 목록 페이지" hrefFor={(p) => href({ page: p })} />
    </>
  );
}
