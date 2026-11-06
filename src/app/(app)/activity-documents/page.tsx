import { Card } from "@/components/ui";
import { reportService } from "@/features/activity/instance";
import { canEdit } from "@/features/activity/model";
import { toKstDateTimeInput } from "@/lib/kst";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { ReportForm, type ReportFormValues } from "./report-form";
import { SubmitReportForm } from "./submit-report-form";

export const metadata = { title: "활동 내역서 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ActivityDocumentsPage({ searchParams }: PageProps<"/activity-documents">) {
  const principal = await requirePrincipal("/activity-documents");
  const params = await searchParams;
  const draftId = Number(one(params.draft)) || null;
  const draft = draftId ? await guard(reportService().lookupDraft(principal.memberId, draftId)) : null;
  const values: ReportFormValues = draft
    ? {
        recordId: draft.activityRecordId,
        recordTitle: draft.recordTitle,
        representative: draft.representative,
        location: draft.location,
        activityAt: toKstDateTimeInput(draft.activityAt),
        content: draft.content,
        participants: draft.participants.map((p) => ({ name: p.name, department: p.department ?? "", studentNo: p.studentNo ?? "", note: p.note ?? "" })),
        hasPhoto: draft.photo !== null,
      }
    : { recordTitle: "", representative: "", location: "", activityAt: toKstDateTimeInput(new Date()), content: "", participants: [], hasPhoto: false };
  const editable = !draft || canEdit(draft.status);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">활동 내역서 (HWPX)</h1>
        <a href="/api/activity-documents/blank" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
          빈 양식 내려받기
        </a>
      </div>
      {one(params.saved) ? (
        <p data-testid="saved-notice" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          임시 저장했습니다. 내용을 확인하고 검수를 요청하세요.
        </p>
      ) : null}
      {draft?.hwpx ? (
        <Card title="생성된 문서">
          <a className="text-sm underline" data-testid="hwpx-link" href={`/api/activity-management/${draft.activityRecordId}/files/${draft.hwpx.fileId}/download`}>
            {draft.hwpx.name}
          </a>
        </Card>
      ) : null}
      {editable ? (
        <Card>
          <ReportForm values={values} />
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">현재 상태에서는 수정할 수 없습니다.</p>
      )}
      {draft && editable ? (
        <Card title="검수 요청">
          <SubmitReportForm recordId={draft.activityRecordId} />
        </Card>
      ) : null}
    </>
  );
}
