import Link from "next/link";
import { Card } from "@/components/ui";
import { ASSET_STATUS_LABEL, TRACKING_LABEL } from "@/features/asset/labels";
import { assetService } from "@/features/asset/instance";
import { ASSET_STATUSES, type AssetStatus } from "@/features/asset/schema";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { RestoreButton } from "./restore-button";

export const metadata = { title: "소품·장비 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PropsPage({ searchParams }: PageProps<"/props">) {
  const principal = await requirePrincipal("/props");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const status = ASSET_STATUSES.find((s) => s === one(params.status)) as AssetStatus | undefined;
  const trackingType = one(params.tracking) === "INDIVIDUAL" || one(params.tracking) === "QUANTITY" ? one(params.tracking) : undefined;
  const deleted = one(params.deleted) === "1";
  const isAdmin = principal.access.canManageGlobal();
  const result = await guard(assetService().searchItems(principal.memberId, { keyword, status, trackingType, deleted, page }));
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">{deleted ? "삭제된 소품·장비" : "소품·장비"}</h1>
        {isAdmin ? (
          <div className="flex gap-2 text-sm font-semibold">
            <Link href="/props/new" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary-strong">
              품목 등록
            </Link>
            <Link href={deleted ? "/props" : "/props?deleted=1"} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 hover:bg-secondary">
              {deleted ? "목록으로" : "삭제됨 목록"}
            </Link>
          </div>
        ) : null}
      </div>
      <form action="/props" className="flex flex-wrap gap-2 text-sm">
        {deleted ? <input type="hidden" name="deleted" value="1" /> : null}
        <input name="q" defaultValue={keyword} placeholder="품목명" className="rounded-md border border-input bg-card px-3 py-2" />
        <select name="status" defaultValue={status ?? ""} aria-label="상태" className="rounded-md border border-input bg-card px-3 py-2">
          <option value="">전체 상태</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="tracking" defaultValue={trackingType ?? ""} aria-label="관리 방식" className="rounded-md border border-input bg-card px-3 py-2">
          <option value="">전체 방식</option>
          <option value="QUANTITY">수량 관리</option>
          <option value="INDIVIDUAL">개별 관리</option>
        </select>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="props-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">품목이 없습니다.</li> : null}
          {result.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link href={deleted ? "#" : `/props/${item.id}`} className="flex flex-wrap items-center gap-3">
                {item.hasPhoto && !deleted ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${item.id}/photo`} alt="" className="size-12 rounded object-cover" />
                ) : null}
                <span className="font-bold">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.category} · {TRACKING_LABEL[item.trackingType]} · {item.totalQuantity}개 · {item.storageLocation} · {ASSET_STATUS_LABEL[item.status]}
                </span>
              </Link>
              {deleted ? <RestoreButton assetItemId={item.id} /> : null}
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
