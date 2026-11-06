"use client";

import { ActionForm } from "@/components/ui";
import { restoreAssetAction } from "@/features/asset/actions";

export function RestoreButton({ assetItemId }: { assetItemId: number }) {
  return (
    <ActionForm action={restoreAssetAction} submitLabel="복구" className="space-y-1">
      <input type="hidden" name="assetItemId" value={assetItemId} />
    </ActionForm>
  );
}
