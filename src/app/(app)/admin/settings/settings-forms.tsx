"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/bandi/button";
import { ConfirmForm } from "@/components/bandi/confirm-form";
import { Icon, type IconName } from "@/components/bandi/icons";
import { submitKeepingValues } from "@/components/bandi/keep-values";
import { Notice } from "@/components/ui";
import { resetSettingsAction, saveHomeSettingsAction, saveNavSettingsAction } from "@/features/admin/actions";
import type { ActionState } from "@/lib/action-result";

const initial: ActionState = { ok: false, message: null };
const MOVE = "inline-flex size-9 items-center justify-center rounded-md border bg-card text-sm font-bold hover:bg-secondary disabled:pointer-events-none disabled:opacity-30";

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface Option {
  key: string;
  label: string;
}

/** 저장 전 변경 여부 배지 */
function DirtyBadge({ dirty }: { dirty: boolean }) {
  return dirty ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-extrabold text-warning" role="status">
      <i className="size-1.5 rounded-full bg-current" />
      저장 전 변경 있음
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-extrabold text-muted-foreground">저장된 상태</span>
  );
}

/** 미리보기 영역의 테두리와 제목 (실제 화면 축소판이라는 것을 분명히 보여준다). */
function PreviewFrame({ title, dirty, testId, children }: { title: string; dirty: boolean; testId: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-secondary/50 p-3 xl:sticky xl:top-4" aria-label={`${title} 미리보기`} data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold">{title} 미리보기</h3>
        <DirtyBadge dirty={dirty} />
      </div>
      <div className="pointer-events-none select-none" aria-hidden="true">{children}</div>
    </section>
  );
}

const CARD_ICON: Record<string, IconName> = { schedule: "clock", notices: "bell", quick: "star" };

function MockLines({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-5 shrink-0 rounded bg-secondary" />
          <span className="h-2 flex-1 rounded-full bg-secondary" style={{ maxWidth: `${88 - i * 14}%` }} />
        </div>
      ))}
    </div>
  );
}

function MockCard({ title, icon, rows, testKey }: { title: string; icon: IconName; rows: number; testKey: string }) {
  return (
    <div className="overflow-hidden rounded-md border bg-card" data-preview-card={testKey}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-[0.7rem] font-extrabold">
        <Icon name={icon} className="size-3 text-accent-foreground" />
        {title}
      </div>
      <MockLines rows={rows} />
    </div>
  );
}

/** 홈 화면 축소판: 실제 홈과 같은 순서(요약 통계 → 활동 알림 → 넓은 왼쪽 열 + 오른쪽 열). */
function HomePreview({ cards, order, hidden }: { cards: Option[]; order: string[]; hidden: Set<string> }) {
  const visible = order.filter((key) => !hidden.has(key));
  const [first, ...rest] = visible;
  const label = (key: string) => cards.find((c) => c.key === key)?.label ?? key;
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-3">
        <div className="h-3 w-40 rounded-full bg-foreground/80" />
        <div className="mt-1.5 h-2 w-28 rounded-full bg-muted-foreground/30" />
      </div>
      {!hidden.has("stats") ? (
        <div className="mb-2 grid grid-cols-3 gap-1.5" data-preview-block="stats">
          {["오늘 일정", "미확인 공지", "주의 자산"].map((name, i) => (
            <div key={name} className={`rounded-md border p-2 ${i === 0 ? "border-primary/40 bg-accent/60" : "bg-card"}`}>
              <p className="text-[0.6rem] font-bold text-muted-foreground">{name}</p>
              <p className="mt-0.5 text-sm font-black">0<small className="text-[0.6rem] text-muted-foreground">건</small></p>
            </div>
          ))}
        </div>
      ) : null}
      {!hidden.has("attention") ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-accent/50 px-2 py-1.5" data-preview-block="attention">
          <span className="size-4 rounded bg-primary" />
          <span className="text-[0.65rem] font-bold">활동 기록 확인 알림 (확인할 기록이 있을 때만)</span>
        </div>
      ) : null}
      {first ? (
        <div className={`grid items-start gap-2 ${rest.length > 0 ? "grid-cols-[1.7fr_1fr]" : ""}`}>
          <MockCard title={label(first)} icon={CARD_ICON[first]} rows={4} testKey={first} />
          {rest.length > 0 ? (
            <div className="flex flex-col gap-2">
              {rest.map((key) => <MockCard key={key} title={label(key)} icon={CARD_ICON[key]} rows={2} testKey={key} />)}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-[0.7rem] text-muted-foreground">표시할 카드가 없어요</p>
      )}
    </div>
  );
}

/** 홈 화면: 블록 표시 여부 + 카드 순서·표시 여부. 첫 카드는 넓은 왼쪽 열에 놓인다. */
export function HomeSettingsForm({ cards, blocks, initialOrder, initialHidden }: { cards: Option[]; blocks: Option[]; initialOrder: string[]; initialHidden: string[] }) {
  const [order, setOrder] = useState(initialOrder);
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [state, action, pending] = useActionState(saveHomeSettingsAction, initial);
  // 서버 값이 바뀌면(저장·기본값 되돌리기) 편집 중인 값을 새 값으로 맞춘다. 저장 결과 안내는 유지된다.
  const signature = JSON.stringify([initialOrder, initialHidden]);
  const [synced, setSynced] = useState(signature);
  if (synced !== signature) {
    setSynced(signature);
    setOrder(initialOrder);
    setHidden(new Set(initialHidden));
  }
  const dirty = JSON.stringify([order, [...hidden].sort()]) !== JSON.stringify([initialOrder, [...initialHidden].sort()]);
  const label = (key: string) => cards.find((c) => c.key === key)?.label ?? key;
  const toggle = (key: string, visible: boolean) => setHidden((current) => {
    const next = new Set(current);
    if (visible) next.delete(key);
    else next.add(key);
    return next;
  });
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <form action={action} onSubmit={submitKeepingValues(action)} className="space-y-4" aria-label="홈 화면 설정">
        {order.map((key) => <input key={key} type="hidden" name="cardOrder" value={key} />)}
        {[...hidden].map((key) => <input key={key} type="hidden" name="hidden" value={key} />)}
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold">상단 영역</legend>
          <div className="flex flex-col gap-2">
            {blocks.map((block) => (
              <label key={block.key} className="flex min-h-11 items-center gap-3 rounded-md border bg-card px-3 text-sm font-bold">
                <input type="checkbox" className="size-4" checked={!hidden.has(block.key)} onChange={(e) => toggle(block.key, e.target.checked)} />
                {block.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold">카드 순서</legend>
          <p className="mb-2 text-xs text-muted-foreground">맨 위 카드는 넓은 왼쪽 열에, 나머지는 오른쪽 열에 놓여요.</p>
          <ol className="flex flex-col gap-2" data-testid="home-card-order">
            {order.map((key, index) => (
              <li key={key} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                <span className="w-5 text-center text-xs font-black text-muted-foreground">{index + 1}</span>
                <label className="flex min-h-9 flex-1 items-center gap-3 font-bold">
                  <input type="checkbox" className="size-4" checked={!hidden.has(key)} onChange={(e) => toggle(key, e.target.checked)} aria-label={`${label(key)} 표시`} />
                  {label(key)}
                </label>
                <button type="button" className={MOVE} onClick={() => setOrder(move(order, index, -1))} disabled={index === 0} aria-label={`${label(key)} 위로`}>↑</button>
                <button type="button" className={MOVE} onClick={() => setOrder(move(order, index, 1))} disabled={index === order.length - 1} aria-label={`${label(key)} 아래로`}>↓</button>
              </li>
            ))}
          </ol>
        </fieldset>
        <Notice state={state} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "저장하는 중…" : "홈 화면 설정 저장"}</button>
          <button type="button" disabled={!dirty} className={buttonClass("outline")} onClick={() => { setOrder(initialOrder); setHidden(new Set(initialHidden)); }}>변경 취소</button>
        </div>
      </form>
      <PreviewFrame title="홈 화면" dirty={dirty} testId="home-preview">
        <HomePreview cards={cards} order={order} hidden={hidden} />
      </PreviewFrame>
    </div>
  );
}

type PreviewRole = "ADMIN" | "LEADER" | "MEMBER";
const ROLE_OPTIONS: { role: PreviewRole; label: string; view: string }[] = [
  { role: "ADMIN", label: "운영진", view: "운영진으로 보기" },
  { role: "LEADER", label: "팀장", view: "팀장으로 보기" },
  { role: "MEMBER", label: "일반 부원", view: "일반 부원으로 보기" },
];

interface NavOption extends Option {
  section: string;
  locked: boolean;
  icon: IconName;
  roles: PreviewRole[] | null;
}

/** 사이드바 축소판: 선택한 역할에게 실제로 보일 메뉴만, 설정한 순서대로. */
function NavPreview({ items, sections, groups, hidden, role }: { items: NavOption[]; sections: string[]; groups: Record<string, string[]>; hidden: Set<string>; role: PreviewRole }) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return (
    <div className="w-56 rounded-md bg-sidebar p-2.5 text-sidebar-foreground">
      <div className="mb-2 flex items-center gap-2 border-b border-sidebar-border px-1.5 pb-2">
        <span className="size-6 rounded bg-white/90" />
        <span>
          <b className="block text-xs font-black text-white">반디</b>
          <span className="block text-[0.6rem] text-sidebar-muted">연극 동아리</span>
        </span>
      </div>
      {sections.map((section) => {
        const visible = groups[section].map((key) => byKey.get(key)!).filter((item) => !hidden.has(item.key) && (!item.roles || item.roles.includes(role)));
        if (visible.length === 0) return null;
        return (
          <div key={section} className="mb-1.5">
            <p className="px-1.5 py-1 text-[0.6rem] font-extrabold text-sidebar-muted">{section}</p>
            {visible.map((item) => (
              <div key={item.key} data-preview-nav={item.key} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[0.7rem] font-bold ${item.key === "dashboard" ? "bg-primary text-primary-foreground" : ""}`}>
                <Icon name={item.icon} className="size-3" />
                {item.label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 사이드바 메뉴: 같은 구역 안에서 순서 변경, 숨김(홈·운영 관리는 숨길 수 없음). */
export function NavSettingsForm({ items, initialOrder, initialHidden }: { items: NavOption[]; initialOrder: string[]; initialHidden: string[] }) {
  const sections = [...new Set(items.map((i) => i.section))];
  const groupsOf = (order: string[]) =>
    Object.fromEntries(sections.map((section) => [section, items.filter((i) => i.section === section).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((i) => i.key)]));
  const [groups, setGroups] = useState(() => groupsOf(initialOrder));
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [role, setRole] = useState<PreviewRole>("MEMBER");
  const [state, action, pending] = useActionState(saveNavSettingsAction, initial);
  const signature = JSON.stringify([initialOrder, initialHidden]);
  const [synced, setSynced] = useState(signature);
  if (synced !== signature) {
    setSynced(signature);
    setGroups(groupsOf(initialOrder));
    setHidden(new Set(initialHidden));
  }
  const currentOrder = sections.flatMap((section) => groups[section]);
  const initialGroups = groupsOf(initialOrder);
  const dirty = JSON.stringify([currentOrder, [...hidden].sort()]) !== JSON.stringify([sections.flatMap((s) => initialGroups[s]), [...initialHidden].sort()]);
  const byKey = new Map(items.map((i) => [i.key, i]));
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <form action={action} onSubmit={submitKeepingValues(action)} className="space-y-4" aria-label="메뉴 설정">
        {currentOrder.map((key) => <input key={key} type="hidden" name="order" value={key} />)}
        {[...hidden].map((key) => <input key={key} type="hidden" name="hidden" value={key} />)}
        {sections.map((section) => (
          <fieldset key={section}>
            <legend className="mb-2 text-xs font-extrabold text-muted-foreground">{section}</legend>
            <ol className="flex flex-col gap-2">
              {groups[section].map((key, index) => {
                const item = byKey.get(key)!;
                return (
                  <li key={key} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                    <label className="flex min-h-9 flex-1 items-center gap-3 font-bold">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={!hidden.has(key)}
                        disabled={item.locked}
                        aria-label={`${item.label} 메뉴 표시`}
                        onChange={(e) => setHidden((current) => {
                          const next = new Set(current);
                          if (e.target.checked) next.delete(key);
                          else next.add(key);
                          return next;
                        })}
                      />
                      {item.label}
                      {item.locked ? <span className="text-xs font-medium text-muted-foreground">(항상 표시)</span> : null}
                      {item.roles ? <span className="text-xs font-medium text-muted-foreground">· {item.roles.map((r) => ROLE_OPTIONS.find((o) => o.role === r)?.label).join("·")}만</span> : null}
                    </label>
                    <button type="button" className={MOVE} disabled={index === 0} aria-label={`${item.label} 위로`} onClick={() => setGroups((g) => ({ ...g, [section]: move(g[section], index, -1) }))}>↑</button>
                    <button type="button" className={MOVE} disabled={index === groups[section].length - 1} aria-label={`${item.label} 아래로`} onClick={() => setGroups((g) => ({ ...g, [section]: move(g[section], index, 1) }))}>↓</button>
                  </li>
                );
              })}
            </ol>
          </fieldset>
        ))}
        <p className="text-xs leading-5 text-muted-foreground">메뉴를 숨겨도 해당 화면의 권한은 바뀌지 않아요. 주소로 직접 들어가면 권한에 따라 그대로 열립니다.</p>
        <Notice state={state} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "저장하는 중…" : "메뉴 설정 저장"}</button>
          <button type="button" disabled={!dirty} className={buttonClass("outline")} onClick={() => { setGroups(groupsOf(initialOrder)); setHidden(new Set(initialHidden)); }}>변경 취소</button>
        </div>
      </form>
      <div className="space-y-2 xl:sticky xl:top-4">
        <div className="flex rounded-md border bg-secondary p-1" role="group" aria-label="미리보기 역할">
          {ROLE_OPTIONS.map((option) => (
            <button key={option.role} type="button" aria-pressed={role === option.role} onClick={() => setRole(option.role)} className={`min-h-11 flex-1 rounded-sm px-3 text-sm font-bold ${role === option.role ? "bg-card" : "text-muted-foreground"}`}>
              {option.view}
            </button>
          ))}
        </div>
        <PreviewFrame title="사이드바" dirty={dirty} testId="nav-preview">
          <NavPreview items={items} sections={sections} groups={groups} hidden={hidden} role={role} />
        </PreviewFrame>
      </div>
    </div>
  );
}

export function ResetSettingsButton({ settingKey, label }: { settingKey: "home" | "nav"; label: string }) {
  return (
    <ConfirmForm action={resetSettingsAction} confirmMessage={`${label}을 원래 배치로 되돌릴까요?`} label="기본값으로 되돌리기" className={buttonClass("outline", "compact")}>
      <input type="hidden" name="key" value={settingKey} />
    </ConfirmForm>
  );
}
