import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { AssetThumb } from "@/components/bandi/asset-thumb";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { ASSET_STATUS_LABEL, CATEGORY_LABEL, TRACKING_SHORT_LABEL, categoryLabel } from "@/features/asset/labels";
import { assetService } from "@/features/asset/instance";
import { ASSET_STATUSES, type AssetStatus } from "@/features/asset/schema";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { RestoreButton } from "./restore-button";

export const metadata = { title: "소품·장비 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SELECT = "h-11 w-full rounded-md border bg-card px-3 text-base md:text-sm";

function StatusBadge({ status, deleted }: { status: string; deleted: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${deleted ? "bg-muted text-muted-foreground" : "bg-secondary text-foreground"}`}>
      {deleted ? "삭제됨" : (ASSET_STATUS_LABEL[status] ?? status)}
    </span>
  );
}

export default async function PropsPage({ searchParams }: PageProps<"/props">) {
  const principal = await requirePrincipal("/props");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const category = Object.keys(CATEGORY_LABEL).includes(one(params.category) ?? "") ? one(params.category) : undefined;
  const status = ASSET_STATUSES.find((s) => s === one(params.status)) as AssetStatus | undefined;
  const trackingType = one(params.tracking) === "INDIVIDUAL" || one(params.tracking) === "QUANTITY" ? one(params.tracking) : undefined;
  const deleted = one(params.deleted) === "1";
  const isAdmin = principal.access.canManageGlobal();
  const result = await guard(assetService().searchItems(principal.memberId, { keyword, category, status, trackingType, deleted, page }));
  const filtered = Boolean(keyword || category || status || trackingType);
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (category) q.set("category", category);
    if (status) q.set("status", status);
    if (trackingType) q.set("tracking", trackingType);
    if (deleted) q.set("deleted", "1");
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/props?${query}` : "/props";
  };
  const actions = (item: (typeof result.items)[number]) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {deleted ? <RestoreButton assetItemId={item.id} name={item.name} /> : isAdmin ? (
        <Link href={`/props/${item.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary">수정</Link>
      ) : null}
    </div>
  );
  return (
    <>
      <PageHead title="소품·장비" description="사진으로 확인하고, 필요한 소품과 장비를 빠르게 찾으세요.">
        {isAdmin ? <Button href="/props/new">품목 등록</Button> : null}
      </PageHead>

      <form action="/props" className="mb-5 rounded-xl border bg-card p-4 sm:p-5" aria-label="소품·장비 검색과 필터">
        {deleted ? <input type="hidden" name="deleted" value="1" /> : null}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="md:col-span-2">
            <label className="sr-only" htmlFor="assetSearch">품목명 또는 보관 위치 검색</label>
            <LiveSearch id="assetSearch" defaultValue={keyword} autoComplete="off" className="h-11 w-full rounded-md border bg-card px-3 text-base outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 md:text-sm" placeholder="품목명 또는 보관 위치 검색" />
          </div>
          <div>
            <label className="sr-only" htmlFor="assetCategory">분류</label>
            <AutoSubmitSelect id="assetCategory" name="category" defaultValue={category ?? ""} className={SELECT}>
              <option value="">전체 분류</option>
              {Object.entries(CATEGORY_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div>
            <label className="sr-only" htmlFor="assetTrackingType">관리 방식</label>
            <AutoSubmitSelect id="assetTrackingType" name="tracking" defaultValue={trackingType ?? ""} className={SELECT}>
              <option value="">전체 관리 방식</option>
              <option value="QUANTITY">수량형</option>
              <option value="INDIVIDUAL">개별 관리</option>
            </AutoSubmitSelect>
          </div>
          <div>
            <label className="sr-only" htmlFor="assetStatus">상태</label>
            <AutoSubmitSelect id="assetStatus" name="status" defaultValue={status ?? ""} className={SELECT}>
              <option value="">전체 상태</option>
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>
              ))}
            </AutoSubmitSelect>
          </div>
        </div>
        {isAdmin ? (
          <Link href={deleted ? "/props" : "/props?deleted=1"} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold hover:underline">
            <span className={`flex size-5 items-center justify-center rounded border ${deleted ? "border-primary bg-primary text-primary-foreground" : "border-input"}`} aria-hidden="true">{deleted ? "✓" : ""}</span>
            삭제된 품목 보기
          </Link>
        ) : null}
      </form>

      <section aria-labelledby="assetListHeading">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="assetListHeading" className="text-lg font-extrabold">{deleted ? "삭제된 품목 목록" : "품목 목록"}</h2>
          <p className="text-sm text-muted-foreground">총 {result.total}개</p>
        </div>

        {result.items.length === 0 ? (
          <div className="rounded-xl border bg-card px-5 py-14 text-center">
            <p className="font-bold">{filtered ? "조건에 맞는 품목이 없습니다" : deleted ? "삭제된 품목이 없습니다" : "등록된 품목이 없습니다"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{filtered ? "검색어나 필터를 바꿔 보세요." : "품목이 등록되면 이곳에 표시됩니다."}</p>
            {filtered ? <Link href="/props" className="mt-4 inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold">필터 초기화</Link> : null}
          </div>
        ) : (
          <div data-testid="props-list">
            <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
              <table className="w-full table-fixed text-left">
                <caption className="sr-only">소품과 장비 목록</caption>
                <thead className="border-b bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-24 px-4 py-3 font-bold">사진</th>
                    <th className="px-4 py-3 font-bold">품목명</th>
                    <th className="w-32 px-4 py-3 font-bold">분류</th>
                    <th className="w-32 px-4 py-3 font-bold">관리</th>
                    <th className="w-44 px-4 py-3 font-bold">보관 위치</th>
                    <th className="w-28 px-4 py-3 font-bold">상태</th>
                    <th className="w-36 px-4 py-3"><span className="sr-only">작업</span></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3"><AssetThumb itemId={item.id} hasPhoto={item.hasPhoto && !deleted} size="size-14" /></td>
                      <td className="px-4 py-3">{deleted ? <span className="font-bold">{item.name}</span> : <Link href={`/props/${item.id}`} className="font-bold hover:underline">{item.name}</Link>}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{categoryLabel(item.category)}</td>
                      <td className="px-4 py-3 text-sm">{TRACKING_SHORT_LABEL[item.trackingType] ?? item.trackingType} · {item.totalQuantity}개</td>
                      <td className="truncate px-4 py-3 text-sm text-muted-foreground" title={item.storageLocation}>{item.storageLocation}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.status} deleted={deleted} /></td>
                      <td className="px-4 py-3">{actions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {result.items.map((item) => (
                <article key={item.id} className="rounded-xl border bg-card p-4">
                  <div className="flex gap-3">
                    <AssetThumb itemId={item.id} hasPhoto={item.hasPhoto && !deleted} size="size-20" />
                    <div className="min-w-0 flex-1">
                      {deleted ? <span className="block truncate font-extrabold">{item.name}</span> : <Link href={`/props/${item.id}`} className="block truncate font-extrabold">{item.name}</Link>}
                      <p className="mt-1 text-sm text-muted-foreground">{categoryLabel(item.category)} · {item.totalQuantity}개</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{item.storageLocation}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <StatusBadge status={item.status} deleted={deleted} />
                    {actions(item)}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        <Pagination page={page} total={result.total} pageSize={result.pageSize} label="소품·장비 목록 페이지" hrefFor={href} />
      </section>
    </>
  );
}
