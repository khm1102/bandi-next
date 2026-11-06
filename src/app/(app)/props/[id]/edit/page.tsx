import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
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
      <h1 className="text-2xl font-black tracking-tight">품목 수정</h1>
      <Card>
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
      </Card>
    </>
  );
}
