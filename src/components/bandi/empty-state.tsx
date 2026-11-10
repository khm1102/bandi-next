import type { ReactNode } from "react";

/** 원본 emptyState.tag: 데이터 없는 목록/검색 결과. */
export function EmptyState({ title, message, children }: { title: string; message?: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-11 text-center">
      <b className="block text-sm font-extrabold">{title}</b>
      {message ? <p className="mt-1 text-xs text-muted-foreground">{message}</p> : null}
      <div className="mt-4 flex justify-center gap-2 empty:hidden">{children}</div>
    </div>
  );
}
