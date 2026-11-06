import { Card } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { AssetEditor } from "../asset-editor";

export const metadata = { title: "품목 등록 · 반디" };

export default async function NewPropPage() {
  // 라우트 단계에서 ADMIN만 허용한다 (화면 자체가 열리지 않는다).
  await requireRole("ADMIN");
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">품목 등록</h1>
      <Card>
        <AssetEditor
          values={{ name: "", category: "", trackingType: "QUANTITY", ownerType: "CLUB", ownerStudentNo: "", externalOwnerName: "", totalQuantity: 1, storageLocation: "", note: "" }}
        />
      </Card>
    </>
  );
}
