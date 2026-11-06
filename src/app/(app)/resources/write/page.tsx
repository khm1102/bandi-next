import { Card } from "@/components/ui";
import { requirePrincipal } from "@/lib/session";
import { ResourceEditor } from "../resource-editor";

export const metadata = { title: "자료 작성 · 반디" };

export default async function WriteResourcePage() {
  await requirePrincipal("/resources/write");
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">자료 작성</h1>
      <Card>
        <ResourceEditor values={{ title: "", body: "", attachments: [] }} />
      </Card>
    </>
  );
}
