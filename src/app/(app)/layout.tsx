import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppShell } from "@/components/app-shell";
import { ROLE_LABEL } from "@/features/member/labels";
import { requirePrincipal } from "@/lib/session";
import type { Role } from "@/features/member/codes";
import type { IconName } from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles?: Role[];
}

// 표시용 내비게이션일 뿐이다. 각 페이지·액션이 서버에서 권한을 다시 검사한다.
const NAV: NavItem[] = [
  { href: "/dashboard", icon: "home", label: "홈" },
  { href: "/calendar", icon: "calendar", label: "캘린더" },
  { href: "/notices", icon: "bell", label: "공지" },
  { href: "/resources", icon: "folder", label: "자료실" },
  { href: "/activity", icon: "clipboard", label: "활동 기록" },
  { href: "/props", icon: "box", label: "소품·장비" },
  { href: "/team-members", icon: "users", label: "팀 멤버", roles: ["LEADER"] },
  { href: "/members", icon: "shield", label: "멤버 관리", roles: ["ADMIN"] },
  { href: "/profile", icon: "user", label: "내 프로필" },
  { href: "/onboarding", icon: "info", label: "처음 시작하기" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(principal.role)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <AppShell items={items} userName={principal.name} roleLabel={ROLE_LABEL[principal.role]} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
