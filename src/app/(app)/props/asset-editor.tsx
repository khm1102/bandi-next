"use client";

import { useState } from "react";
import { EditorForm } from "@/components/bandi/editor-form";
import { saveAssetAction } from "@/features/asset/actions";
import { CATEGORY_LABEL } from "@/features/asset/labels";

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

const INPUT = "h-12 w-full rounded-md border bg-card px-4 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const SELECT = "h-12 w-full rounded-md border bg-card px-3 text-base md:text-sm";
const LABEL = "mb-2 block text-sm font-extrabold";

/** 원본 props/form.jsp 레이아웃: 기본 정보 · 품목 사진 · 추가 정보(접힘). 서버가 모든 값을 다시 검증한다. */
export function AssetEditor({ values }: { values: AssetEditorValues }) {
  const [ownerType, setOwnerType] = useState(values.ownerType);
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  }

  const knownCategory = Object.keys(CATEGORY_LABEL).includes(values.category);
  const edit = Boolean(values.assetItemId);

  return (
    <EditorForm action={saveAssetAction} cancelHref="/props" submitLabel="품목 저장">
      {values.assetItemId ? <input type="hidden" name="assetItemId" value={values.assetItemId} /> : null}
      {photoId ? <input type="hidden" name="photoFileId" value={photoId} /> : null}

      <section className="space-y-5" aria-labelledby="assetBasicHeading">
        <div className="border-b pb-4">
          <h2 id="assetBasicHeading" className="text-lg font-extrabold">기본 정보</h2>
          <p className="mt-1 text-sm text-muted-foreground">현장에서 바로 찾을 수 있는 정보부터 입력하세요.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="assetName">품목명</label>
            <input id="assetName" name="name" required maxLength={100} placeholder="예: 유선 마이크 3번" defaultValue={values.name} className={INPUT} />
          </div>
          <div>
            <label className={LABEL} htmlFor="assetCategory">분류</label>
            <select id="assetCategory" name="category" required defaultValue={values.category || "PROP"} className={SELECT}>
              {Object.entries(CATEGORY_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
              {!knownCategory && values.category ? <option value={values.category}>{values.category}</option> : null}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="assetStorageLocation">보관 위치</label>
            <input id="assetStorageLocation" name="storageLocation" required maxLength={200} placeholder="예: 무대팀 창고 A" defaultValue={values.storageLocation} className={INPUT} />
          </div>
        </div>
      </section>

      <section className="border-y py-6" aria-labelledby="assetPhotoHeading">
        <div className="mb-4">
          <h2 id="assetPhotoHeading" className="text-lg font-extrabold">품목 사진</h2>
          <p className="mt-1 text-sm text-muted-foreground">사진 한 장으로 품목을 빠르게 구분할 수 있어요. 새 사진을 고르면 기존 사진이 교체됩니다.</p>
        </div>
        <label className="group flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-card p-4 text-center transition-colors hover:border-primary focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="max-h-80 max-w-full rounded-lg object-contain" alt="선택한 품목 사진 미리보기" src={preview} />
          ) : (
            <span className="space-y-2">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-xl text-muted-foreground" aria-hidden="true">▣</span>
              <span className="block font-extrabold">사진을 찍거나 앨범에서 선택하세요</span>
              <span className="block text-sm text-muted-foreground">JPG, PNG, WebP 이미지 한 장</span>
            </span>
          )}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label="사진 첨부"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await upload(file);
            }}
          />
        </label>
        <p className="mt-3 text-sm text-muted-foreground">{photoName ? `선택한 사진: ${photoName}` : "사진은 선택 사항이에요."}</p>
        {uploadError ? <p className="mt-3 rounded-md border border-destructive bg-destructive-soft px-3 py-2.5 text-sm text-destructive" role="alert">{uploadError}</p> : null}
      </section>

      <details className="rounded-xl border bg-card" open={edit || ownerType !== "CLUB"}>
        <summary className="min-h-14 cursor-pointer px-5 py-4 text-sm font-extrabold">추가 정보</summary>
        <div className="grid gap-5 border-t p-5 md:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="assetTrackingType">관리 방식</label>
            {edit ? (
              <>
                <input type="hidden" name="trackingType" value={values.trackingType} />
                <select id="assetTrackingType" disabled defaultValue={values.trackingType} className={SELECT}>
                  <option value="QUANTITY">수량형</option>
                  <option value="INDIVIDUAL">개별 관리</option>
                </select>
                <p className="mt-2 text-sm text-muted-foreground">개별 장비와 변경 이력을 보존하기 위해 관리 방식은 등록 후 변경할 수 없어요.</p>
              </>
            ) : (
              <select id="assetTrackingType" name="trackingType" defaultValue={values.trackingType} className={SELECT}>
                <option value="QUANTITY">수량형</option>
                <option value="INDIVIDUAL">개별 관리</option>
              </select>
            )}
          </div>
          <div>
            <label className={LABEL} htmlFor="assetTotalQuantity">수량</label>
            <input id="assetTotalQuantity" type="number" name="totalQuantity" required min={1} inputMode="numeric" defaultValue={values.totalQuantity} className={INPUT} />
          </div>
          <div>
            <label className={LABEL} htmlFor="assetOwnerType">소유 구분</label>
            <select id="assetOwnerType" name="ownerType" value={ownerType} onChange={(e) => setOwnerType(e.target.value as typeof ownerType)} className={SELECT}>
              <option value="CLUB">동아리 소유</option>
              <option value="MEMBER">부원 소유</option>
              <option value="EXTERNAL">외부 소유</option>
            </select>
          </div>
          {ownerType === "EXTERNAL" ? (
            <div>
              <label className={LABEL} htmlFor="assetExternalOwnerName">외부 소유자</label>
              <input id="assetExternalOwnerName" name="externalOwnerName" required maxLength={100} placeholder="외부 소유자 이름" defaultValue={values.externalOwnerName} className={INPUT} />
            </div>
          ) : null}
          {ownerType === "MEMBER" ? (
            <div className="md:col-span-2">
              <label className={LABEL} htmlFor="assetOwnerStudentNo">소유 멤버 학번</label>
              <input id="assetOwnerStudentNo" name="ownerStudentNo" required maxLength={20} placeholder="소유 멤버의 학번" defaultValue={values.ownerStudentNo} className={INPUT} />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="assetNote">비고</label>
            <textarea id="assetNote" name="note" rows={4} placeholder="사용 시 유의할 점이나 관리 메모를 적어 주세요." defaultValue={values.note} className="w-full rounded-md border bg-card px-4 py-3 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm" />
          </div>
        </div>
      </details>
    </EditorForm>
  );
}
