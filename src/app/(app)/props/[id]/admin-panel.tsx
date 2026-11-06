"use client";

import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { changeAssetStatusAction, deleteAssetAction, registerUnitAction } from "@/features/asset/actions";

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
      <Card title="품목 삭제">
        <ActionForm action={deleteAssetAction} submitLabel="삭제">
          {hidden}
          <p className="text-sm text-muted-foreground">삭제해도 이력과 개별 장비는 보존되며, 삭제됨 목록에서 복구할 수 있습니다.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
