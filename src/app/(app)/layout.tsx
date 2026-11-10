import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppShell } from "@/components/app-shell";
import { NAV } from "./nav-items";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL } from "@/features/member/labels";
import { requirePrincipal } from "@/lib/session";


export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  const profile = await memberService().lookupProfile(principal.memberId);
  const items = NAV.filter((item) => !item.roles || item.roles.includes(principal.role)).map(({ roles: _roles, ...item }) => {
    void _roles;
    return item;
  });
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
