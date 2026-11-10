"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/bandi/icons";

export interface ShellNavItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  section: "기본" | "동아리" | "활동" | "관리";
}

const NAV_BASE = "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-colors";
const NAV_OFF = " hover:bg-sidebar-accent hover:text-white";
const NAV_ON = " bg-primary font-extrabold text-primary-foreground";

/** 화면 경로 → 활성 메뉴. 메뉴에 없는 하위 화면은 소속 메뉴로 묶는다(원본 active 속성 대응). */
function activeKey(pathname: string, items: ShellNavItem[]): ShellNavItem | undefined {
  const alias: [string, string][] = [["/activity-documents", "activity"], ["/notices/manage", "notices"]];
  for (const [prefix, key] of alias) {
    if (pathname.startsWith(prefix)) return items.find((item) => item.key === key);
  }
  return [...items].sort((a, b) => b.href.length - a.href.length).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

/**
 * 관리자 셸: 모바일 헤더(lg 미만) + 사이드바(lg 이상 고정, 미만은 서랍) + 브레드크럼 탑바 + 본문.
 * 원본 layout.tag/sidebar.tag/navigation.js의 구조와 클래스를 그대로 옮겼다. 내비는 표시용이며 권한은 서버가 다시 검사한다.
 */
export function AppShell(props: {
  items: ShellNavItem[];
  userName: string;
  userMeta: string;
  photoUrl: string | null;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const current = activeKey(pathname, props.items);

  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>('[aria-current="page"], a[href]')?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const sections = ["기본", "동아리", "활동", "관리"] as const;

  return (
    <>
      <a href="#mainContent" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform focus:translate-y-0">
        본문으로 바로가기
      </a>
      <div className="min-h-dvh lg:flex">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-card px-4 lg:hidden">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2.5 font-black">
            <Image src="/images/bandi-icon.png" width={32} height={32} className="h-8 w-auto rounded-md object-contain" alt="반디" />
            <span>반디</span>
          </Link>
          <button
            ref={toggle}
            type="button"
            className="ml-auto flex size-11 items-center justify-center rounded-md border bg-card text-foreground"
            aria-controls="mainNavigation"
            aria-expanded={open}
            aria-label={open ? "전체 메뉴 닫기" : "전체 메뉴 열기"}
            onClick={() => (open ? close() : setOpen(true))}
          >
            <Icon name="menu" className="size-5" />
          </button>
        </header>
        <button type="button" className={`fixed inset-0 z-30 bg-sidebar/60 lg:hidden ${open ? "" : "hidden"}`} aria-label="메뉴 닫기" onClick={close} />
        <aside
          ref={panel}
          id="mainNavigation"
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto overscroll-contain bg-sidebar p-4 text-sidebar-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0 ${open ? "" : "-translate-x-full"}`}
        >
          <Link href="/dashboard" className="flex min-h-14 items-center gap-2.5 border-b border-sidebar-border px-2 pb-4">
            <Image src="/images/bandi-icon.png" width={32} height={32} className="h-8 w-auto rounded-md object-contain" alt="반디" />
            <span>
              <b className="block text-sm font-black text-white">반디</b>
              <span className="block text-xs font-semibold text-sidebar-muted">연극 동아리</span>
            </span>
          </Link>
          <nav className="mt-3 flex flex-col gap-1" aria-label="주 메뉴">
            {sections.map((section, index) => {
              const items = props.items.filter((item) => item.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section} className="flex flex-col gap-1">
                  <p className={`px-2 pb-1 ${index === 0 ? "pt-2" : "pt-3"} text-xs font-extrabold text-sidebar-muted`}>{section}</p>
                  {items.map((item) => {
                    const on = current?.key === item.key;
                    return (
                      <Link key={item.key} href={item.href} className={`${NAV_BASE}${on ? NAV_ON : NAV_OFF}`} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)}>
                        <Icon name={item.icon} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border px-2 pt-3">
            <Link href="/profile" className="flex min-w-0 items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-sidebar-accent">
              <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-black text-primary-foreground">
                {props.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="size-full object-cover" src={props.photoUrl} alt="" />
                ) : (
                  <span>{props.userName.slice(0, 1)}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm text-white">{props.userName}</b>
                <span className="block break-words text-xs leading-4 text-sidebar-muted">{props.userMeta}</span>
              </span>
            </Link>
            <div className="flex flex-wrap justify-center gap-x-2 text-xs text-sidebar-muted">
              <Link href="/privacy" className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                개인정보 안내
              </Link>
              <span className="flex min-h-11 items-center" aria-hidden="true">
                ·
              </span>
              <Link href="/support" className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                운영 문의
              </Link>
            </div>
            <form action={props.logoutAction}>
              <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-md border border-sidebar-border px-3 text-xs font-extrabold text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white">
                로그아웃
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-14 z-20 hidden min-h-12 items-center gap-3 border-b bg-card/95 px-4 py-2.5 backdrop-blur md:flex md:px-6 lg:top-0 lg:px-7">
            <p className="hidden text-xs font-semibold text-muted-foreground md:block">
              반디 / <b className="font-extrabold text-foreground">{current?.label ?? "반디"}</b>
            </p>
          </header>
          <main id="mainContent" className="w-full p-4 md:p-6 lg:p-7" tabIndex={-1}>
            <div className="mx-auto w-full max-w-screen-2xl">{props.children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
