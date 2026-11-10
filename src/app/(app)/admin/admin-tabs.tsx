"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "통계" },
  { href: "/admin/settings", label: "화면 설정" },
  { href: "/admin/accounts", label: "계정 운영" },
  { href: "/admin/audit", label: "감사 로그" },
  { href: "/admin/export", label: "내보내기" },
];

/** 원본 캘린더 보기 전환과 같은 분할 버튼 모양의 탭. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 overflow-x-auto" aria-label="운영 관리 메뉴">
      <div className="inline-flex min-w-max rounded-md border bg-secondary p-1">
        {TABS.map((tab) => {
          const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-sm px-4 text-sm font-bold transition-colors ${active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
