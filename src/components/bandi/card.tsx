import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** 원본 card.tag: 제목/더보기 헤더(선택) + 본문. flush면 본문 패딩 제거(리스트·테이블용). */
export function Card({ title, icon, moreUrl, moreLabel, flush = false, children }: {
  title?: string;
  icon?: IconName;
  moreUrl?: string;
  moreLabel?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      {title ? (
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            {icon ? <Icon name={icon} className="size-4 text-accent-foreground" /> : null}
            {title}
          </h2>
          {moreUrl ? (
            <Link href={moreUrl} className="ml-auto text-xs font-bold text-accent-foreground hover:underline">
              {moreLabel ?? "더보기"}
            </Link>
          ) : moreLabel ? (
            <span className="ml-auto text-xs font-bold text-muted-foreground">{moreLabel}</span>
          ) : null}
        </header>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
