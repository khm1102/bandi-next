import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { ACTION_LABEL, ASSET_STATUS_LABEL, OWNER_LABEL, TRACKING_LABEL } from "@/features/asset/labels";
import { assetService } from "@/features/asset/instance";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { AdminPanel } from "./admin-panel";

export const metadata = { title: "소품·장비 · 반디" };

export default async function PropDetailPage({ params }: PageProps<"/props/[id]">) {
  const principal = await requirePrincipal("/props");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const service = assetService();
  const [item, units, histories] = await guard(
    Promise.all([service.lookupItem(principal.memberId, id), service.searchUnits(principal.memberId, id), service.searchHistories(principal.memberId, id)]),
  );
  const isAdmin = principal.access.canManageGlobal();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">{item.name}</h1>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold" data-testid="asset-status">
          {ASSET_STATUS_LABEL[item.status]}
        </span>
      </div>
      <Card>
        <div className="flex flex-wrap gap-4">
          {item.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${item.id}/photo`} alt={item.name} className="size-32 rounded-lg object-cover" />
          ) : null}
          <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">분류</dt><dd>{item.category}</dd>
            <dt className="text-muted-foreground">관리 방식</dt><dd>{TRACKING_LABEL[item.trackingType]}</dd>
            <dt className="text-muted-foreground">수량</dt><dd>{item.totalQuantity}개</dd>
            <dt className="text-muted-foreground">보관 위치</dt><dd>{item.storageLocation}</dd>
            <dt className="text-muted-foreground">소유</dt><dd>{OWNER_LABEL[item.ownerType]}{item.externalOwnerName ? ` · ${item.externalOwnerName}` : ""}</dd>
            {item.note ? (<><dt className="text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap">{item.note}</dd></>) : null}
          </dl>
        </div>
      </Card>
      {item.trackingType === "INDIVIDUAL" ? (
        <Card title="개별 장비">
          <ul className="space-y-1 text-sm" data-testid="unit-list">
            {units.length === 0 ? <li className="text-muted-foreground">등록된 장비가 없습니다.</li> : null}
            {units.map((u) => (
              <li key={u.id}>
                {u.managementNo} · {ASSET_STATUS_LABEL[u.status]} · {u.storageLocation}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card title="변경 이력">
        <ul className="space-y-1 text-sm" data-testid="asset-history">
          {histories.map((h) => (
            <li key={h.id}>
              {formatDateTime(h.changedAt)} · {h.actorName} · {ACTION_LABEL[h.action]} {h.quantity}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ul>
      </Card>
      {isAdmin ? (
        <>
          <Link href={`/props/${item.id}/edit`} className="inline-block inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
            수정
          </Link>
          <AdminPanel
            assetItemId={item.id}
            status={item.status}
            individual={item.trackingType === "INDIVIDUAL"}
            statuses={Object.keys(ASSET_STATUS_LABEL)}
            statusLabels={ASSET_STATUS_LABEL}
          />
        </>
      ) : null}
    </>
  );
}
