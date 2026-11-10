import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { reportService } from "@/features/activity/instance";
import { toKstDateTimeInput } from "@/lib/kst";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { ReportForm, type ReportFormValues } from "./report-form";

export const metadata = { title: "활동 내역서 만들기 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 새 문서의 기본 일시: 현재 시각을 5분 단위로 내림 (원본 localDateTimeValue). */
function defaultActivityAt(): string {
  const rounded = new Date(Math.floor(Date.now() / 300_000) * 300_000);
  return toKstDateTimeInput(rounded);
}

export default async function ActivityDocumentsPage({ searchParams }: PageProps<"/activity-documents">) {
  const principal = await requirePrincipal("/activity-documents");
  const params = await searchParams;
  const draftId = Number(one(params.draft)) || null;
  const [draft, presidentName] = await Promise.all([
    draftId ? guard(reportService().lookupDraft(principal.memberId, draftId)) : Promise.resolve(null),
    reportService().presidentName(),
  ]);
  const values: ReportFormValues = draft
    ? {
        recordId: draft.activityRecordId,
        recordTitle: draft.recordTitle,
        representative: draft.representative,
        location: draft.location,
        activityAt: toKstDateTimeInput(draft.activityAt),
        content: draft.content,
        participants: draft.participants.map((p) => ({ name: p.name, department: p.department ?? "", studentNo: p.studentNo ?? "", note: p.note ?? "" })),
        storedPhotoUrl: draft.photo ? `/api/activity-management/${draft.activityRecordId}/files/${draft.photo.fileId}/download` : null,
        storedPhotoName: draft.photo?.name ?? null,
        storedDocument: draft.hwpx ? { url: `/api/activity-management/${draft.activityRecordId}/files/${draft.hwpx.fileId}/download`, name: draft.hwpx.name } : null,
        status: draft.status,
      }
    : {
        recordTitle: "",
        representative: "",
        location: "",
        activityAt: defaultActivityAt(),
        content: "",
        participants: [],
        storedPhotoUrl: null,
        storedPhotoName: null,
        storedDocument: null,
        status: null,
      };
  return (
    <>
      <PageHead title="활동 내역서 만들기" description="양식에 필요한 내용만 입력하면 제출용 HWPX 파일을 만듭니다.">
        <Button variant="outline" href="/api/activity-documents/blank" className="w-full md:w-auto">빈 양식 다운로드</Button>
      </PageHead>
      <ReportForm key={draft?.activityRecordId ?? "new"} values={values} presidentName={presidentName} />
      <p className="mt-4 text-xs leading-5 text-muted-foreground">HWPX는 한컴의 공개 문서 포맷 안내를 참고해 생성합니다. 최종 제출 전 한글에서 내용과 사진 배치를 확인해 주세요.</p>
    </>
  );
}
