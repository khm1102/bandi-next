import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "활동 기록 · 반디" };

export default async function ArchiveDetailPage({ params }: PageProps<"/activity/archive/[id]">) {
  const principal = await requirePrincipal("/activity/archive");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const record = await guard(activityService().lookupApproved(principal.memberId, id));
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">{record.title}</h1>
      <p className="text-sm text-muted-foreground">
        {record.teamName} · {record.authorName} · {formatDateTime(record.activityAt)} · {record.participantCount}명
      </p>
      <Card>
        <p className="whitespace-pre-wrap text-sm">{record.body}</p>
      </Card>
      {record.files.length > 0 ? (
        <Card title="파일">
          <ul className="space-y-1 text-sm" data-testid="archive-files">
            {record.files.map((f) => (
              <li key={f.linkId}>
                <a className="underline" href={`/api/activity-records/${record.id}/files/${f.fileId}/download`}>
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
