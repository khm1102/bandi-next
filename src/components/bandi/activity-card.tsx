import Link from "next/link";
import { Badge } from "@/components/bandi/badge";
import { buttonClass } from "@/components/bandi/button";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUS_TONE, RECORD_TYPE_LABEL } from "@/features/activity/labels";
import type { ActivityStatus } from "@/features/activity/schema";
import { formatDateTime } from "@/lib/format";

interface Item {
  id: number;
  title: string;
  teamName: string;
  authorName: string;
  activityAt: Date;
  participantCount: number;
  status: ActivityStatus;
  updatedAt: Date;
  coverFileId: number | null;
  documentFileId: number | null;
  recordType: "SIMPLE" | "HWPX";
}

/** 원본 activity/list·archive 카드: 좌측 인증 사진, 우측 배지·제목·메타. */
export function ActivityCard({ item, href, photoBase, mode }: { item: Item; href: string; photoBase: string; mode: "mine" | "archive" }) {
  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col sm:flex-row">
        <div className="relative flex h-44 w-full shrink-0 items-center justify-center overflow-hidden border-b bg-secondary sm:h-auto sm:w-48 sm:border-b-0 sm:border-r">
          {item.coverFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="size-full object-cover" alt={`${item.title} 활동 사진`} src={`${photoBase}/${item.id}/files/${item.coverFileId}/download`} />
          ) : (
            <span className="px-4 text-center text-xs font-bold text-muted-foreground">인증 사진 없음</span>
          )}
        </div>
        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {mode === "mine" ? (
              <>
                <Badge tone="neutral">{item.teamName}</Badge>
                <Badge tone={ACTIVITY_STATUS_TONE[item.status]}>{ACTIVITY_STATUS_LABEL[item.status]}</Badge>
              </>
            ) : (
              <>
                <Badge tone="neutral">{item.teamName || "팀 미정"}</Badge>
                <Badge tone={item.recordType === "HWPX" ? "info" : "neutral"}>{RECORD_TYPE_LABEL[item.recordType]}</Badge>
              </>
            )}
          </div>
          <h3 className="mt-3 text-base font-black">{item.title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{formatDateTime(item.activityAt)} · 참여 {item.participantCount}명</p>
          <p className="mt-3 text-xs text-muted-foreground">{item.authorName || "작성자 미상"} 작성 · {formatDateTime(item.updatedAt)} 수정</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={href} className={buttonClass("outline", "compact", "w-full sm:w-auto")}>상세 보기</Link>
            {mode === "archive" && item.documentFileId ? (
              <a href={`/api/activity-records/${item.id}/files/${item.documentFileId}/download`} className={buttonClass("outline", "compact", "w-full sm:w-auto")}>HWPX 다운로드</a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
