import { forbidden, notFound } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { resourceService } from "@/features/resource/instance";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { ResourceEditor } from "../../resource-editor";

export const metadata = { title: "자료 수정 · 반디" };

export default async function EditResourcePage({ params }: PageProps<"/resources/[id]/edit">) {
  const principal = await requirePrincipal("/resources");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const resource = await guard(resourceService().lookup(principal.memberId, id));
  if (!resource.canManage) forbidden();
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="자료 수정" description="내용과 파일을 함께 정리해 동아리 멤버에게 공유하세요.">
          <Button variant="outline" href="/resources">목록으로</Button>
        </PageHead>
      </div>
      <ResourceEditor
        values={{
          resourceId: resource.id,
          title: resource.title,
          body: resource.body,
          attachments: resource.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType })),
        }}
      />

    </>
  );
}
