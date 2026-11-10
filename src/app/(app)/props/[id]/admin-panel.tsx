"use client";

import { ConfirmForm } from "@/components/bandi/confirm-form";
import { deleteAssetAction } from "@/features/asset/actions";
import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { changeAssetStatusAction, registerUnitAction } from "@/features/asset/actions";

export function AdminPanel(props: {
  assetItemId: number;
  status: string;
  individual: boolean;
  statuses: string[];
  statusLabels: Record<string, string>;
}) {
  const hidden = <input type="hidden" name="assetItemId" value={props.assetItemId} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="상태 변경">
        <ActionForm action={changeAssetStatusAction} submitLabel="상태 변경">
          {hidden}
          <select name="status" defaultValue={props.status} aria-label="상태" className={inputClass}>
            {props.statuses.map((s) => (
              <option key={s} value={s}>
                {props.statusLabels[s]}
              </option>
            ))}
          </select>
          <Field label="메모 (선택)">
            <input name="note" maxLength={400} className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
      {props.individual ? (
        <Card title="개별 장비 등록">
          <ActionForm action={registerUnitAction} submitLabel="장비 등록">
            {hidden}
            <Field label="관리번호">
              <input name="managementNo" required maxLength={50} className={inputClass} />
            </Field>
            <Field label="보관 위치">
              <input name="storageLocation" required maxLength={200} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

export function DeleteAssetButton({ assetItemId, name }: { assetItemId: number; name: string }) {
  return (
    <ConfirmForm
      action={deleteAssetAction}
      confirmMessage={`“${name}” 품목을 삭제할까요? 일반 목록에서 숨겨지고 변경 이력은 보존됩니다.`}
      label="품목 삭제"
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90"
    >
      <input type="hidden" name="assetItemId" value={assetItemId} />
    </ConfirmForm>
  );
}
