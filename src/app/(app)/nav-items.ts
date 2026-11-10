import type { ShellNavItem } from "@/components/app-shell";

export type NavDef = ShellNavItem & { roles?: ("ADMIN" | "LEADER" | "MEMBER")[] };

// 원본 sidebar.tag의 메뉴와 같다. 표시용일 뿐이며 각 페이지·액션이 서버에서 권한을 다시 검사한다.
export const NAV: NavDef[] = [
  { key: "dashboard", href: "/dashboard", label: "홈", icon: "home", section: "기본" },
  { key: "onboarding", href: "/onboarding", label: "처음 시작하기", icon: "clockCircle", section: "기본" },
  { key: "calendar", href: "/calendar", label: "통합 캘린더", icon: "calendar", section: "동아리" },
  { key: "notices", href: "/notices", label: "공지", icon: "notice", section: "동아리" },
  { key: "resources", href: "/resources", label: "자료실", icon: "folder", section: "동아리" },
  { key: "activity", href: "/activity", label: "내 활동 기록", icon: "activity", section: "활동" },
  { key: "activity-archive", href: "/activity/archive", label: "승인 기록", icon: "archive", section: "활동", roles: ["ADMIN", "LEADER"] },
  { key: "activity-review", href: "/activity/review", label: "활동 기록 검수", icon: "review", section: "활동", roles: ["ADMIN", "LEADER"] },
  { key: "props", href: "/props", label: "소품·장비", icon: "box", section: "관리" },
  { key: "team-members", href: "/team-members", label: "팀 멤버 관리", icon: "team", section: "관리", roles: ["LEADER"] },
  { key: "members", href: "/members", label: "멤버·권한", icon: "members", section: "관리", roles: ["ADMIN"] },
  { key: "admin", href: "/admin", label: "운영 관리", icon: "chart", section: "관리", roles: ["ADMIN"] },
];

