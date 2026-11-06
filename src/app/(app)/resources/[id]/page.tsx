import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ShareControls } from "@/components/share-controls";
import { issueResourceShareAction, revokeResourceShareAction } from "@/features/resource/actions";
import { resourceService } from "@/features/resource/instance";
import { formatDateTime } from "@/lib/format";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { DeleteResourceForm } from "./delete-form";

export const metadata = { title: "자료 · 반디" };

export default async function ResourceDetailPage({ params }: PageProps<"/resources/[id]">) {
  const principal = await requirePrincipal("/resources");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const resource = await guard(resourceService().lookup(principal.memberId, id));
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">{resource.title}</h1>
      <p className="text-sm text-muted-foreground">
        {resource.createdByName} · 수정 {formatDateTime(resource.updatedAt)}
      </p>
      <Card>
        <Markdown html={resource.html} />
      </Card>
      {resource.previews.length > 0 ? (
        <Card title="링크">
          <ul className="space-y-3" data-testid="link-cards">
            {resource.previews.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-lg border border-border p-3 text-sm">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                ) : null}
                <div className="min-w-0">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate font-bold underline">
                    {p.title ?? p.url}
                  </a>
                  {p.description ? <p className="line-clamp-2 text-muted-foreground">{p.description}</p> : null}
                  <p className="text-xs text-muted-foreground">{p.domain}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {resource.attachments.length > 0 ? (
        <Card title="첨부 파일">
          <ul className="space-y-1 text-sm" data-testid="attachments">
            {resource.attachments.map((a) => (
              <li key={a.id}>
                <a className="underline" href={`/api/resources/${resource.id}/files/${a.id}/download`}>
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <ShareControls
        idField="resourceId"
        id={resource.id}
        ownPath={`/resources/${resource.id}`}
        canIssue={resource.canManage}
        shared={resource.shared}
        issueAction={issueResourceShareAction}
        revokeAction={revokeResourceShareAction}
      />
      {resource.canManage ? (
        <Card title="관리">
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/resources/${resource.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
              수정
            </Link>
            <DeleteResourceForm resourceId={resource.id} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
