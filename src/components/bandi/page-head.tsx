import type { ReactNode } from "react";

/** 원본 pageHead.tag: 제목/설명 + 우측 액션. */
export function PageHead({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-end gap-3.5">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid w-full grid-cols-1 gap-2 md:ml-auto md:flex md:w-auto md:flex-wrap md:items-center">{children}</div>
    </div>
  );
}
