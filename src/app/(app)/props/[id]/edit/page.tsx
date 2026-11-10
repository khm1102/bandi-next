import { notFound } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { assetService } from "@/features/asset/instance";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";
import { AssetEditor } from "../../asset-editor";

export const metadata = { title: "품목 수정 · 반디" };

export default async function EditPropPage({ params }: PageProps<"/props/[id]/edit">) {
  const principal = await requireRole("ADMIN");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const item = await guard(assetService().lookupItem(principal.memberId, id));
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="소품·장비" description="이름과 사진부터 등록하고, 필요한 정보만 더 입력하세요.">
          <Button variant="outline" href="/props">목록으로</Button>
        </PageHead>
      </div>
      <AssetEditor
        values={{
          assetItemId: item.id,
          name: item.name,
          category: item.category,
          trackingType: item.trackingType,
          ownerType: item.ownerType as "CLUB" | "MEMBER" | "EXTERNAL",
          ownerStudentNo: "",
          externalOwnerName: item.externalOwnerName ?? "",
          totalQuantity: item.totalQuantity,
          storageLocation: item.storageLocation,
          note: item.note ?? "",
        }}
      />

    </>
  );
}
