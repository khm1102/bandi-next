import { Badge } from "@/components/bandi/badge";
import { EmptyState } from "@/components/bandi/empty-state";
import { FilterChip } from "@/components/bandi/filter-chip";
import { LiveSearch } from "@/components/bandi/live-search";
import { Pagination } from "@/components/bandi/pagination";
import { adminService } from "@/features/admin/instance";
import { ROLE_LABEL, STATUS_LABEL } from "@/features/member/labels";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";
import { ResetPasswordButton, UnlockButton } from "./account-actions";

export const metadata = { title: "계정 운영 · 운영 관리 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminAccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const principal = await requireRole("ADMIN");
  const params = await searchParams;
  const keyword = one(params.q) ?? "";
  const filter = one(params.filter) === "locked" || one(params.filter) === "no-password" ? (one(params.filter) as "locked" | "no-password") : undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const result = await guard(adminService().searchAccounts(principal.memberId, { keyword, filter, page }));
  const href = (next: { filter?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    const f = "filter" in next ? next.filter : filter;
    if (f) q.set("filter", f);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const query = q.toString();
    return query ? `/admin/accounts?${query}` : "/admin/accounts";
  };
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <form action="/admin/accounts" className="flex min-w-0 flex-1">
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <LiveSearch defaultValue={keyword} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="이름 또는 학번으로 검색" aria-label="계정 검색" />
        </form>
        <div className="flex flex-wrap gap-2" aria-label="계정 필터">
          <FilterChip href={href({ filter: undefined, page: 1 })} label="전체" active={!filter} />
          <FilterChip href={href({ filter: "locked", page: 1 })} label="로그인 잠김" dot active={filter === "locked"} />
          <FilterChip href={href({ filter: "no-password", page: 1 })} label="비밀번호 미설정" active={filter === "no-password"} />
        </div>
      </div>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">로그인은 5번 실패하면 15분 동안 잠겨요. 비밀번호 재설정을 요구하면 해당 멤버는 학교 계정 인증 후 새 비밀번호를 정해야 해요.</p>
      <section className="rounded-lg border bg-card" aria-label="계정 목록">
        {result.items.length === 0 ? (
          <EmptyState title="조건에 맞는 계정이 없습니다" message="검색어나 필터를 바꿔 보세요." />
        ) : (
          <ul className="divide-y" data-testid="account-list">
            {result.items.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{m.name}</b>
                    <span className="text-xs tabular-nums text-muted-foreground">{m.studentNo}</span>
                    <Badge tone="neutral">{m.teamName}</Badge>
                    <Badge tone={m.role === "ADMIN" ? "accent" : m.role === "LEADER" ? "info" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                    {m.status !== "ACTIVE" ? <Badge tone="warning">{STATUS_LABEL[m.status]}</Badge> : null}
                    {m.hasPassword ? <Badge tone="success">비밀번호 설정됨</Badge> : <Badge tone="warning">비밀번호 미설정</Badge>}
                    {m.lockedUntil ? <Badge tone="danger" dot>잠김 · {formatDateTime(m.lockedUntil)}까지</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">마지막 로그인 {formatDateTime(m.lastLoginAt)} · 비밀번호 설정 {formatDateTime(m.passwordSetAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.lockedUntil ? <UnlockButton memberId={m.id} name={m.name} /> : null}
                  {m.hasPassword && m.id !== principal.memberId ? <ResetPasswordButton memberId={m.id} name={m.name} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="계정 목록 페이지" hrefFor={(p) => href({ page: p })} />
    </>
  );
}
