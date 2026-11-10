import { notFound } from "next/navigation";
import { Button, buttonClass } from "@/components/bandi/button";
import { Markdown } from "@/components/markdown";
import { ShareControls } from "@/components/share-controls";
import { issueResourceShareAction, revokeResourceShareAction } from "@/features/resource/actions";
import { resourceService } from "@/features/resource/instance";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { DeleteResourceForm } from "./delete-form";

export const metadata = { title: "자료 · 반디" };
const DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function ResourceDetailPage({ params }: PageProps<"/resources/[id]">) {
  const principal = await requirePrincipal("/resources");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const resource = await guard(resourceService().lookup(principal.memberId, id));
  return (
    <article className="rounded-lg border bg-card p-5 md:p-8">
      <h1 className="text-2xl font-black">{resource.title}</h1>
      <p className="mt-3 text-xs text-muted-foreground">
        {resource.createdByName} 작성 · {DATE.format(resource.updatedAt)} 수정
      </p>
      <Markdown html={resource.html} className="mt-7" />
      {resource.previews.length > 0 ? (
        <section className="mt-7 border-t pt-5">
          <h2 className="text-sm font-extrabold">링크 미리보기</h2>
          <div className="mt-3 grid gap-3" data-testid="link-cards">
            {resource.previews.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block rounded-md border p-4 hover:bg-secondary">
                <p className="text-xs text-muted-foreground">{p.domain}</p>
                <p className="mt-1 font-bold">{p.title ?? p.url}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.description || "링크 열기"}</p>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="mt-3 max-h-56 w-full rounded object-cover" />
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mt-8 border-t pt-5">
        <h2 className="text-sm font-extrabold">첨부 파일</h2>
        <ul className="mt-3 space-y-2" data-testid="attachments">
          {resource.attachments.length === 0 ? <li className="text-sm text-muted-foreground">첨부 파일이 없습니다.</li> : null}
          {resource.attachments.map((a) => (
            <li key={a.id}>
              <a className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-bold hover:bg-secondary" href={`/api/resources/${resource.id}/files/${a.id}/download`}>
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-8 flex flex-wrap gap-2 border-t pt-5">
        <Button variant="outline" href="/resources">목록으로</Button>
        <ShareControls idField="resourceId" id={resource.id} ownPath={`/resources/${resource.id}`} title={resource.title} canIssue={resource.canManage} shared={resource.shared} issueAction={issueResourceShareAction} revokeAction={revokeResourceShareAction} />
        {resource.canManage ? (
          <>
            <a href={`/resources/${resource.id}/edit`} className={buttonClass("outline", "default", "")}>자료 수정</a>
            <DeleteResourceForm resourceId={resource.id} />
          </>
        ) : null}
      </div>
    </article>
  );
}
