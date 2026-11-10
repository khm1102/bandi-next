import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { requirePrincipal } from "@/lib/session";
import { ResourceEditor } from "../resource-editor";

export const metadata = { title: "자료 작성 · 반디" };

export default async function WriteResourcePage() {
  await requirePrincipal("/resources/write");
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="자료 작성" description="내용과 파일을 함께 정리해 동아리 멤버에게 공유하세요.">
          <Button variant="outline" href="/resources">목록으로</Button>
        </PageHead>
      </div>
      <ResourceEditor values={{ title: "", body: "", attachments: [] }} />
    </>
  );
}
