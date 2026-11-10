import { Card } from "@/components/bandi/card";
import { adminService } from "@/features/admin/instance";
import { HOME_BLOCKS, HOME_CARDS, NAV_LOCKED, type NavKey } from "@/features/admin/settings-model";
import { requireRole } from "@/lib/session";
import { NAV } from "../../nav-items";
import { HomeSettingsForm, NavSettingsForm, ResetSettingsButton } from "./settings-forms";

export const metadata = { title: "화면 설정 · 운영 관리 · 반디" };

export default async function AdminSettingsPage() {
  await requireRole("ADMIN");
  const [home, nav] = await Promise.all([adminService().home(), adminService().nav()]);
  return (
    <div className="flex flex-col gap-4">
      <Card title="홈 화면">
        <p className="mb-4 text-sm text-muted-foreground">모든 멤버의 홈에 적용돼요. 오른쪽 미리보기에서 저장 전 모습을 확인할 수 있어요.</p>
        <HomeSettingsForm
          cards={HOME_CARDS.map((c) => ({ key: c.key, label: c.label }))}
          blocks={HOME_BLOCKS.map((b) => ({ key: b.key, label: b.label }))}
          initialOrder={home.cardOrder}
          initialHidden={home.hidden}
        />
        <div className="mt-4 border-t pt-4"><ResetSettingsButton settingKey="home" label="홈 화면" /></div>
      </Card>
      <Card title="사이드바 메뉴">
        <p className="mb-4 text-sm text-muted-foreground">같은 구역 안에서 순서를 바꾸거나 숨길 수 있어요. 미리보기에서 역할별로 실제 보이는 메뉴를 확인하세요.</p>
        <NavSettingsForm
          items={NAV.map((item) => ({ key: item.key, label: item.label, section: item.section, icon: item.icon, roles: item.roles ?? null, locked: NAV_LOCKED.includes(item.key as NavKey) }))}
          initialOrder={nav.order}
          initialHidden={nav.hidden}
        />
        <div className="mt-4 border-t pt-4"><ResetSettingsButton settingKey="nav" label="사이드바 메뉴" /></div>
      </Card>
    </div>
  );
}
