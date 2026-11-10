/** 원본 props 목록 썸네일: 테두리 있는 정사각 박스, 사진이 없으면 기본 표시. */
export function AssetThumb({ itemId, hasPhoto, size }: { itemId: number; hasPhoto: boolean; size: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-md border bg-secondary`}>
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${itemId}/photo`} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg text-muted-foreground" aria-hidden="true">▣</div>
      )}
    </div>
  );
}
