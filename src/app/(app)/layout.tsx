import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppShell } from "@/components/app-shell";
import { NAV } from "./nav-items";
import { adminService } from "@/features/admin/instance";
import { applyNav } from "@/features/admin/settings-model";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL } from "@/features/member/labels";
import { requirePrincipal } from "@/lib/session";


export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  const [profile, navSettings] = await Promise.all([memberService().lookupProfile(principal.memberId), adminService().nav()]);
  // 운영진이 정한 메뉴 순서·숨김을 적용한다 (표시만 바뀌고 각 화면의 권한 검사는 그대로다).
  const permitted = NAV.filter((item) => !item.roles || item.roles.includes(principal.role)).map(({ roles: _roles, ...item }) => {
    void _roles;
    return item;
  });
  const items = applyNav(permitted, navSettings);
  const meta = profile.department ? `${ROLE_LABEL[principal.role]} · ${profile.department}` : ROLE_LABEL[principal.role];
  return (
    <AppShell
      items={items}
      userName={principal.name}
      userMeta={meta}
      photoUrl={profile.profilePhotoFileId ? `/api/members/${principal.memberId}/profile-photo` : null}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
