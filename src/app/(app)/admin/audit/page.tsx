import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { Badge } from "@/components/bandi/badge";
import { EmptyState } from "@/components/bandi/empty-state";
import { Pagination } from "@/components/bandi/pagination";
import { DataTable } from "@/components/data-table";
import { adminService } from "@/features/admin/instance";
import { AUDIT_ACTION_LABEL } from "@/features/admin/labels";
import { AUDIT_ACTIONS, type AuditAction } from "@/features/audit/schema";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";

export const metadata = { title: "감사 로그 · 운영 관리 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const principal = await requireRole("ADMIN");
  const params = await searchParams;
  const action = AUDIT_ACTIONS.find((a) => a === one(params.action)) as AuditAction | undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const result = await guard(adminService().searchAudit(principal.memberId, { action, page }));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (action) q.set("action", action);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/admin/audit?${query}` : "/admin/audit";
  };
  return (
    <>
      <form action="/admin/audit" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <label className="mb-1.5 block text-xs font-extrabold text-muted-foreground" htmlFor="auditAction">동작</label>
          <AutoSubmitSelect id="auditAction" name="action" defaultValue={action ?? ""} className="h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm">
            <option value="">전체 동작</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>)}
          </AutoSubmitSelect>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">멤버 정보 변경, 소품 삭제·복구, 화면 설정, 계정 운영, 데이터 내보내기 기록이 남아요.</p>
      </form>
      <div className="rounded-lg border bg-card">
        {result.items.length === 0 ? (
          <EmptyState title="기록이 없습니다" message={action ? "다른 동작을 선택해 보세요." : "운영 기록이 생기면 이곳에 표시됩니다."} />
        ) : (
          <DataTable
            caption="감사 로그"
            testId="audit-list"
            rows={result.items}
            rowKey={(e) => e.id}
            columns={[
              { header: "시각", className: "whitespace-nowrap tabular-nums", cell: (e) => formatDateTime(e.occurredAt) },
              { header: "처리자", className: "whitespace-nowrap", cell: (e) => e.actorName ?? "시스템" },
              { header: "동작", className: "whitespace-nowrap", cell: (e) => <Badge tone="neutral">{AUDIT_ACTION_LABEL[e.action as AuditAction] ?? e.action}</Badge> },
              { header: "내용", cell: (e) => e.summary },
            ]}
          />
        )}
      </div>
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="감사 로그 페이지" hrefFor={href} />
    </>
  );
}
