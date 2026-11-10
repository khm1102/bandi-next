import Link from "next/link";

const BASE = "inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-ring md:h-8";

/** 원본 filterChip.tag (링크 버전: 서버 렌더링 필터). */
export function FilterChip({ href, label, active = false, count, dot = false }: { href: string; label: string; active?: boolean; count?: number | string; dot?: boolean }) {
  return (
    <Link href={href} aria-pressed={active} className={`${BASE} ${active ? "border-sidebar bg-sidebar text-white" : "bg-card text-muted-foreground hover:border-sidebar-muted"}`}>
      {dot ? <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> : null}
      {label}
      {count !== undefined ? <span className="opacity-70">{count}</span> : null}
    </Link>
  );
}
