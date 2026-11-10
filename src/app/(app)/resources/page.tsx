import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { resourceService } from "@/features/resource/instance";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "자료실 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const principal = await requirePrincipal("/resources");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const result = await resourceService().search(principal.memberId, { keyword, page });
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/resources?${query}` : "/resources";
  };
  return (
    <>
      <PageHead title="자료실" description="동아리에서 함께 보는 자료를 모아 둡니다.">
        <Button href="/resources/write">자료 작성</Button>
      </PageHead>
      <form action="/resources">
        <label className="sr-only" htmlFor="resourceSearch">자료 검색</label>
        <LiveSearch id="resourceSearch" defaultValue={keyword} className="h-11 w-full rounded-md border bg-card px-3 text-sm" placeholder="제목, 내용, 작성자로 검색" />
      </form>
      {result.items.length === 0 ? (
        <section className="mt-5 rounded-lg border bg-card p-8 text-center">
          <b>{keyword ? "검색 결과가 없습니다" : "아직 등록된 자료가 없습니다"}</b>
          <p className="mt-2 text-sm text-muted-foreground">{keyword ? "다른 검색어로 다시 찾아보세요." : "첫 자료를 작성해 보세요."}</p>
        </section>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="resource-list">
          {result.items.map((r) => (
            <article key={r.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex min-h-44 flex-col sm:flex-row">
                <div className="h-44 w-full shrink-0 bg-secondary sm:h-auto sm:w-40">
                  {r.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-full w-full object-cover" alt={`${r.title} 대표 이미지`} src={r.cover.source === "LINK_PREVIEW" ? `/api/resources/${r.id}/link-previews/${r.cover.fileId}/inline` : `/api/resources/${r.id}/files/${r.cover.fileId}/inline`} />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 p-5">
                  <h2 className="truncate text-lg font-extrabold">{r.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.excerpt}</p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {r.createdByName} 작성 · {DATE.format(r.updatedAt)} 수정 · 첨부 {r.fileCount}개
                  </p>
                  <Link href={`/resources/${r.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-bold hover:bg-secondary">
                    상세 보기
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="자료 목록 페이지" hrefFor={href} />
    </>
  );
}
