import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { Badge } from "@/components/bandi/badge";
import { Button } from "@/components/bandi/button";
import { EmptyState } from "@/components/bandi/empty-state";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { noticeService } from "@/features/notice/instance";
import { STATUS_LABEL, STATUS_TONE } from "@/features/notice/labels";
import { NOTICE_SCOPES, NOTICE_STATUSES, type NoticeScope, type NoticeStatus } from "@/features/notice/schema";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata = { title: "공지 관리 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SELECT = "h-11 rounded-md border border-input bg-card px-3 text-sm md:w-44";

export default async function ManageNoticesPage({ searchParams }: PageProps<"/notices/manage">) {
  const principal = await requireRole("ADMIN", "LEADER");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = NOTICE_STATUSES.find((s) => s === one(params.status)) as NoticeStatus | undefined;
  const scope = NOTICE_SCOPES.find((s) => s === one(params.scope)) as NoticeScope | undefined;
  const keyword = one(params.q) ?? "";
  const result = await noticeService().searchManageable(principal.memberId, { keyword, status, scope, page });
  const isAdmin = principal.role === "ADMIN";
  const filtered = Boolean(keyword || status || scope);
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (status) q.set("status", status);
    if (scope) q.set("scope", scope);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/notices/manage?${query}` : "/notices/manage";
  };
  return (
    <>
      <PageHead title="공지 관리" description="작성 중인 공지와 게시 상태를 확인하고 관리하세요.">
        <Button href="/notices/write">새 공지 작성</Button>
      </PageHead>
      <form action="/notices/manage" className="mb-5 flex flex-col gap-3 md:flex-row">
        <LiveSearch defaultValue={keyword} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="제목과 내용으로 검색" aria-label="관리 공지 검색" />
        <AutoSubmitSelect name="status" defaultValue={status ?? ""} className={SELECT} aria-label="공지 상태">
          <option value="">전체 상태</option>
          {NOTICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </AutoSubmitSelect>
        {isAdmin ? (
          <AutoSubmitSelect name="scope" defaultValue={scope ?? ""} className={SELECT} aria-label="공지 대상">
            <option value="">전체 대상</option>
            <option value="ALL">전체 공지</option>
            <option value="TEAM">팀 공지</option>
          </AutoSubmitSelect>
        ) : null}
      </form>
      <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="manageListTitle">
        <h2 id="manageListTitle" className="sr-only">관리할 공지 목록</h2>
        {result.items.length === 0 ? (
          <EmptyState title={filtered ? "조건에 맞는 공지가 없습니다" : "관리할 공지가 없습니다"} message={filtered ? "검색어나 필터를 바꿔 보세요." : "새 공지를 작성해 보세요."}>
            {filtered ? <Button variant="outline" href="/notices/manage">필터 초기화</Button> : null}
          </EmptyState>
        ) : (
          <div className="divide-y" data-testid="manage-list">
            {result.items.map((n) => (
              <Link key={n.id} href={`/notices/manage/${n.id}`} className="block px-5 py-5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                  <Badge tone="info">{n.targetScope === "TEAM" ? n.teamName || "팀 공지" : "전체 공지"}</Badge>
                  {n.important ? <Badge tone="warning" dot>중요</Badge> : null}
                </div>
                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <b className="block truncate text-base">{n.title}</b>
                    <p className="mt-1 text-xs text-muted-foreground">작성 {n.createdByName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">최근 수정 {formatDateTime(n.updatedAt)}</p>
                  </div>
                  <span className="text-sm font-bold text-primary">{n.status === "DRAFT" ? "이어서 작성" : "상세 관리"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="공지 관리 목록 페이지" hrefFor={href} />
    </>
  );
}
