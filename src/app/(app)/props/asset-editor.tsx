"use client";

import { useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import { saveAssetAction } from "@/features/asset/actions";

export interface AssetEditorValues {
  assetItemId?: number;
  name: string;
  category: string;
  trackingType: string;
  ownerType: "CLUB" | "MEMBER" | "EXTERNAL";
  ownerStudentNo: string;
  externalOwnerName: string;
  totalQuantity: number;
  storageLocation: string;
  note: string;
}

export function AssetEditor({ values }: { values: AssetEditorValues }) {
  const [ownerType, setOwnerType] = useState(values.ownerType);
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files/private?domain=asset", { method: "POST", body: form });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      setUploadError(error?.message ?? "업로드하지 못했습니다.");
      return;
    }
    setPhotoId(((await response.json()) as { id: number }).id);
    setPhotoName(file.name);
  }

  return (
    <ActionForm action={saveAssetAction} submitLabel="저장">
      {values.assetItemId ? <input type="hidden" name="assetItemId" value={values.assetItemId} /> : null}
      {photoId ? <input type="hidden" name="photoFileId" value={photoId} /> : null}
      <Field label="품목명">
        <input name="name" required maxLength={100} defaultValue={values.name} className={inputClass} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="분류">
          <input name="category" required maxLength={50} defaultValue={values.category} className={inputClass} />
        </Field>
        <Field label="관리 방식">
          {values.assetItemId ? (
            <>
              <input type="hidden" name="trackingType" value={values.trackingType} />
              <p className="py-2 text-sm">{values.trackingType === "INDIVIDUAL" ? "개별 관리" : "수량 관리"} (변경 불가)</p>
            </>
          ) : (
            <select name="trackingType" defaultValue={values.trackingType} className={inputClass}>
              <option value="QUANTITY">수량 관리</option>
              <option value="INDIVIDUAL">개별 관리</option>
            </select>
          )}
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="수량">
          <input type="number" name="totalQuantity" required min={1} defaultValue={values.totalQuantity} className={inputClass} />
        </Field>
        <Field label="보관 위치">
          <input name="storageLocation" required maxLength={200} defaultValue={values.storageLocation} className={inputClass} />
        </Field>
      </div>
      <Field label="소유">
        <select name="ownerType" value={ownerType} onChange={(e) => setOwnerType(e.target.value as typeof ownerType)} className={inputClass}>
          <option value="CLUB">동아리</option>
          <option value="MEMBER">개인 (멤버)</option>
          <option value="EXTERNAL">외부</option>
        </select>
      </Field>
      {ownerType === "MEMBER" ? (
        <Field label="소유 멤버 학번">
          <input name="ownerStudentNo" required maxLength={20} defaultValue={values.ownerStudentNo} className={inputClass} />
        </Field>
      ) : null}
      {ownerType === "EXTERNAL" ? (
        <Field label="외부 소유자명">
          <input name="externalOwnerName" required maxLength={100} defaultValue={values.externalOwnerName} className={inputClass} />
        </Field>
      ) : null}
      <Field label="사진 (선택)">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label="사진 첨부"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await upload(file);
          }}
        />
      </Field>
      {photoName ? <p className="text-sm">선택한 사진: {photoName}</p> : null}
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <Field label="메모">
        <textarea name="note" rows={3} defaultValue={values.note} className={inputClass} />
      </Field>
    </ActionForm>
  );
}
