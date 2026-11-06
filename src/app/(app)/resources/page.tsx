import Link from "next/link";
import { Card } from "@/components/ui";
import { resourceService } from "@/features/resource/instance";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "자료실 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const principal = await requirePrincipal("/resources");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const result = await resourceService().search(principal.memberId, { keyword, page });
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const qs = (p: number) => `/resources?${new URLSearchParams({ ...(keyword ? { q: keyword } : {}), page: String(p) })}`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">자료실</h1>
        <Link href="/resources/write" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
          자료 작성
        </Link>
      </div>
      <form action="/resources" className="flex gap-2 text-sm">
        <input name="q" defaultValue={keyword} placeholder="제목·본문·작성자 검색" className="flex-1 rounded-md border border-input bg-card px-3 py-2" />
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="resource-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">자료가 없습니다.</li> : null}
          {result.items.map((r) => (
            <li key={r.id} className="py-3">
              <Link href={`/resources/${r.id}`} className="block space-y-1">
                <span className="font-bold">{r.title}</span>
                <span className="block text-sm text-muted-foreground">{r.excerpt}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.createdByName} · {formatDateTime(r.updatedAt)} · 첨부 {r.fileCount}
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
