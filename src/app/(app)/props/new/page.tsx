import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { requireRole } from "@/lib/session";
import { AssetEditor } from "../asset-editor";

export const metadata = { title: "품목 등록 · 반디" };

export default async function NewPropPage() {
  // 라우트 단계에서 ADMIN만 허용한다 (화면 자체가 열리지 않는다).
  await requireRole("ADMIN");
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="소품·장비" description="이름과 사진부터 등록하고, 필요한 정보만 더 입력하세요.">
          <Button variant="outline" href="/props">목록으로</Button>
        </PageHead>
      </div>
      <AssetEditor
        values={{ name: "", category: "", trackingType: "QUANTITY", ownerType: "CLUB", ownerStudentNo: "", externalOwnerName: "", totalQuantity: 1, storageLocation: "", note: "" }}
      />

    </>
  );
}
