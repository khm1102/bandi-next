"use client";

import { ConfirmForm } from "@/components/bandi/confirm-form";
import { restoreAssetAction } from "@/features/asset/actions";

export function RestoreButton({ assetItemId, name }: { assetItemId: number; name: string }) {
  return (
    <ConfirmForm
      action={restoreAssetAction}
      confirmMessage={`“${name}” 품목을 복구할까요? 일반 목록에 다시 표시됩니다.`}
      label="복구"
      className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary"
    >
      <input type="hidden" name="assetItemId" value={assetItemId} />
    </ConfirmForm>
  );
}
