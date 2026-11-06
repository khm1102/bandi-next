"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** 와인 사이드바(lg 이상 고정, 미만은 서랍) + 스티키 탑바 + 중앙 정렬 본문. 내비는 표시용이며 권한은 서버가 다시 검사한다. */
export function AppShell(props: {
  items: ShellNavItem[];
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = (
    <nav aria-label="주 메뉴" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
      {props.items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex min-h-11 items-center rounded-md px-3 text-sm font-bold transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon name={item.icon} className="mr-3 size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="text-xl font-black tracking-tight text-sidebar-accent-foreground">
          반디
        </Link>
      </div>
      {nav}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-black text-sidebar-accent-foreground" aria-hidden="true">
            {props.userName.slice(0, 1)}
          </span>
          <div className="min-w-0 text-sm">
            <p className="truncate font-bold text-sidebar-accent-foreground">{props.userName}</p>
            <p className="text-xs text-sidebar-muted">{props.roleLabel}</p>
          </div>
        </div>
        <form action={props.logoutAction} className="mt-3">
          <button type="submit" className="min-h-11 w-full rounded-md px-3 text-left text-sm font-bold text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-56">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 bg-sidebar lg:block">{sidebarBody}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="메뉴">
          <button type="button" aria-label="메뉴 닫기" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-xl">{sidebarBody}</aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4 lg:px-7">
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-secondary lg:hidden"
        >
          <span aria-hidden="true" className="text-lg">☰</span>
        </button>
        <span className="text-sm font-extrabold lg:hidden">반디</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {props.userName} · {props.roleLabel}
        </span>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 lg:p-7">
        <div className="mx-auto w-full max-w-4xl space-y-4">{props.children}</div>
      </main>
    </div>
  );
}
