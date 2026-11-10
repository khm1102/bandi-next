import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { ACTION_LABEL, ASSET_STATUS_LABEL, OWNER_LABEL, TRACKING_SHORT_LABEL, categoryLabel } from "@/features/asset/labels";
import { assetService } from "@/features/asset/instance";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { AdminPanel, DeleteAssetButton } from "./admin-panel";

export const metadata = { title: "소품·장비 상세 · 반디" };
const DT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const SECTION = "rounded-xl border bg-card p-5 sm:p-6";

function Status({ status }: { status: string }) {
  return <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-foreground">{ASSET_STATUS_LABEL[status] ?? status}</span>;
}

export default async function PropDetailPage({ params }: PageProps<"/props/[id]">) {
  const principal = await requirePrincipal("/props");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const service = assetService();
  const [item, units, histories] = await guard(
    Promise.all([service.lookupItem(principal.memberId, id), service.searchUnits(principal.memberId, id), service.searchHistories(principal.memberId, id)]),
  );
  const isAdmin = principal.access.canManageGlobal();
  const individual = item.trackingType === "INDIVIDUAL";
  const facts: [string, string][] = [
    ["보관 위치", item.storageLocation],
    ["수량", `${item.totalQuantity}개`],
    ["소유 구분", OWNER_LABEL[item.ownerType] ?? item.ownerType],
    ["소유자", item.externalOwnerName || (item.ownerType === "MEMBER" ? "등록 멤버" : "-")],
    ["비고", item.note || "-"],
  ];
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" href="/props">목록으로</Button>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Link href={`/props/${item.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold hover:bg-secondary">품목 수정</Link>
            <DeleteAssetButton assetItemId={item.id} name={item.name} />
          </div>
        ) : null}
      </div>

      <div className="space-y-7">
        <article className="overflow-hidden rounded-xl border bg-card">
          <div className="grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
            <div className="flex min-h-72 items-center justify-center bg-secondary p-5">
              {item.hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${item.id}/photo`} alt={`${item.name} 사진`} className="max-h-96 w-full rounded-lg object-contain" />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">등록된 사진이 없습니다.</span>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span data-testid="asset-status"><Status status={item.status} /></span>
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">{TRACKING_SHORT_LABEL[item.trackingType] ?? item.trackingType}</span>
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">{item.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{categoryLabel(item.category)}</p>
              <dl className="mt-7 grid gap-5 sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </article>

        {individual ? (
          <section className={SECTION} aria-labelledby="assetUnitsHeading">
            <div>
              <h2 id="assetUnitsHeading" className="text-lg font-extrabold">개별 장비</h2>
              <p className="mt-1 text-sm text-muted-foreground">개별 관리 품목의 관리번호와 현재 상태를 확인해요.</p>
            </div>
            {units.length === 0 ? (
              <p className="mt-5 rounded-md bg-secondary px-4 py-5 text-center text-sm text-muted-foreground">등록된 개별 장비가 없습니다.</p>
            ) : (
              <div data-testid="unit-list">
                <div className="mt-5 hidden overflow-x-auto md:block">
                  <table className="min-w-[42rem] w-full text-left">
                    <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-3">관리번호</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">보관 위치</th></tr></thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id} className="border-b last:border-b-0">
                          <td className="px-3 py-3 text-sm font-bold">{u.managementNo}</td>
                          <td className="px-3 py-3"><Status status={u.status} /></td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">{u.storageLocation || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 grid gap-3 md:hidden">
                  {units.map((u) => (
                    <article key={u.id} className="rounded-lg border bg-card p-4">
                      <h3 className="text-sm font-extrabold">{u.managementNo}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{u.storageLocation || "보관 위치 없음"}</p>
                      <div className="mt-4"><Status status={u.status} /></div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}

        <section className={SECTION} aria-labelledby="assetHistoryHeading">
          <h2 id="assetHistoryHeading" className="text-lg font-extrabold">변경 이력</h2>
          <p className="mt-1 text-sm text-muted-foreground">삭제와 복구를 포함한 품목 변경 이력이 남아요.</p>
          {histories.length === 0 ? (
            <p className="mt-5 rounded-md bg-secondary px-4 py-5 text-center text-sm text-muted-foreground">아직 변경 이력이 없습니다.</p>
          ) : (
            <ol className="mt-5 space-y-3" data-testid="asset-history">
              {histories.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0">
                  <div>
                    <strong className="text-sm">{ACTION_LABEL[h.action] ?? h.action}</strong>
                    <span className="ml-2 text-sm text-muted-foreground">{h.note || "변경 내용이 기록되었습니다."}</span>
                  </div>
                  <time className="text-xs text-muted-foreground">{DT.format(h.changedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        {isAdmin ? (
          <section aria-labelledby="assetAdminHeading">
            <h2 id="assetAdminHeading" className="mb-3 text-lg font-extrabold">관리 작업</h2>
            <AdminPanel assetItemId={item.id} status={item.status} individual={individual} statuses={Object.keys(ASSET_STATUS_LABEL)} statusLabels={ASSET_STATUS_LABEL} />
          </section>
        ) : null}
      </div>
    </section>
  );
}
