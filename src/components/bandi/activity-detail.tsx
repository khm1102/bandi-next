import type { ReactNode } from "react";
import { Badge } from "@/components/bandi/badge";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUS_TONE } from "@/features/activity/labels";
import type { ActivityStatus } from "@/features/activity/schema";
import { formatDateTime } from "@/lib/format";

interface ActivityRecordView {
  id: number;
  title: string;
  teamName: string;
  authorName: string;
  activityAt: Date;
  participantCount: number;
  status: ActivityStatus;
  body: string;
  files: { linkId: number; fileId: number; name: string; role: string }[];
  history?: { reviewedAt: Date; reviewerName: string; previousStatus: string; newStatus: string; comment: string | null }[];
}

const ROLE_META: Record<string, [string, "accent" | "neutral" | "info"]> = {
  EVIDENCE: ["인증", "accent"],
  ADDITIONAL: ["추가", "neutral"],
  DOCUMENT: ["HWPX", "info"],
};
const label = (code: string) => ACTIVITY_STATUS_LABEL[code as ActivityStatus] ?? code;

/** 원본 review-detail/archive-detail/활동 상세 모달의 공통 본문 (배지·제목·내용·증빙·검수 이력). */
export function ActivityDetailView({ record, fileBase, testIdFiles, children }: { record: ActivityRecordView; fileBase: string; testIdFiles: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5 lg:p-7">
      <div className="flex flex-wrap gap-2">
        <span data-testid="activity-status"><Badge tone={ACTIVITY_STATUS_TONE[record.status]}>{ACTIVITY_STATUS_LABEL[record.status]}</Badge></span>
        <Badge tone="neutral">{record.teamName}</Badge>
      </div>
      <h2 className="mt-3 text-2xl font-black">{record.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {record.authorName} 작성 · {formatDateTime(record.activityAt)} · 참여 {record.participantCount}명
      </p>
      <div className="mt-6 border-t pt-6">
        <h3 className="text-sm font-extrabold">활동 내용</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{record.body}</p>
      </div>
      <section className="mt-6 border-t pt-6">
        <h3 className="text-sm font-extrabold">증빙 및 문서</h3>
        {record.files.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">등록된 첨부가 없습니다.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid={testIdFiles}>
            {record.files.map((f) => {
              const [roleLabel, tone] = ROLE_META[f.role] ?? [f.role, "neutral" as const];
              const url = `${fileBase}/${record.id}/files/${f.fileId}/download`;
              return (
                <article key={f.linkId} className="overflow-hidden rounded-md border">
                  {f.role !== "DOCUMENT" ? (
                    <div className="relative flex h-48 items-center justify-center bg-secondary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="size-full object-cover" alt={f.name} src={url} />
                    </div>
                  ) : null}
                  <div className="p-3">
                    <div className="flex items-center gap-2"><Badge tone={tone}>{roleLabel}</Badge><b className="block min-w-0 flex-1 truncate text-xs">{f.name}</b></div>
                    <a className="mt-3 inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-bold hover:bg-secondary" href={url}>다운로드</a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {record.history ? (
        <section className="mt-6 border-t pt-6">
          <h3 className="text-sm font-extrabold">검수 이력</h3>
          {record.history.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">아직 검수 이력이 없습니다.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2" data-testid="activity-history">
              {record.history.map((h, i) => (
                <li key={i} className="rounded-md border px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{h.reviewerName}</b>
                    <time className="text-xs text-muted-foreground">{formatDateTime(h.reviewedAt)}</time>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{label(h.previousStatus)} → {label(h.newStatus)}</p>
                  {h.comment ? <p className="mt-1 text-sm">{h.comment}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {children}
    </div>
  );
}
