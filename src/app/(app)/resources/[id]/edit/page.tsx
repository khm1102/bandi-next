import { forbidden, notFound } from "next/navigation";
import { Card } from "@/components/ui";
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
      <h1 className="text-2xl font-black tracking-tight">자료 수정</h1>
      <Card>
        <ResourceEditor
          values={{
            resourceId: resource.id,
            title: resource.title,
            body: resource.body,
            attachments: resource.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType })),
          }}
        />
      </Card>
    </>
  );
}
