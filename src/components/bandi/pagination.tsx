import Link from "next/link";

const NAV_BTN = "inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring";
const DISABLED = "pointer-events-none opacity-50";

/** 원본 pagination.tag (링크 버전). hrefFor(page)로 URL을 만든다. */
export function Pagination({ page, total, pageSize, label, hrefFor }: { page: number; total: number; pageSize: number; label: string; hrefFor: (page: number) => string }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const pages = Array.from({ length: last }, (_, i) => i + 1).filter((p) => p === 1 || p === last || Math.abs(p - page) <= 2);
  return (
    <nav className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label={label}>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        총 {total}건
      </p>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Link href={hrefFor(Math.max(1, page - 1))} aria-disabled={page <= 1} className={`${NAV_BTN} ${page <= 1 ? DISABLED : ""}`}>
          이전
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                className={`inline-flex size-11 items-center justify-center rounded-md text-sm font-medium ${p === page ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                {p}
              </Link>
            </span>
          ))}
        </div>
        <span className="min-w-20 text-center text-sm font-medium text-foreground sm:hidden">
          {page} / {last}
        </span>
        <Link href={hrefFor(Math.min(last, page + 1))} aria-disabled={page >= last} className={`${NAV_BTN} ${page >= last ? DISABLED : ""}`}>
          다음
        </Link>
      </div>
    </nav>
  );
}
