/**
 * 운영진 화면 설정의 순수 규칙. 저장 값은 항상 허용 목록으로 정규화한다:
 * 모르는 키는 버리고, 중복은 한 번만, 빠진 키는 기본 순서대로 뒤에 붙인다.
 */

export const HOME_CARDS = [
  { key: "schedule", label: "오늘의 일정" },
  { key: "notices", label: "중요·미확인 공지" },
  { key: "quick", label: "빠른 이동" },
] as const;
export type HomeCardKey = (typeof HOME_CARDS)[number]["key"];

export const HOME_BLOCKS = [
  { key: "stats", label: "요약 통계 (오늘 일정·미확인 공지·주의 자산)" },
  { key: "attention", label: "활동 기록 확인 알림" },
] as const;
export type HomeBlockKey = (typeof HOME_BLOCKS)[number]["key"];

export interface HomeSettings {
  /** 카드 순서: 첫 카드는 넓은 왼쪽 열, 나머지는 오른쪽 열에 놓인다 (원본 배치와 같은 기본값). */
  cardOrder: HomeCardKey[];
  /** 숨긴 카드·블록 */
  hidden: (HomeCardKey | HomeBlockKey)[];
}

export const NAV_KEYS = [
  "dashboard",
  "onboarding",
  "calendar",
  "notices",
  "resources",
  "activity",
  "activity-archive",
  "activity-review",
  "props",
  "team-members",
  "members",
  "admin",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];
/** 숨길 수 없는 메뉴: 홈과 운영 관리(설정을 되돌릴 길이 없어지지 않도록). */
export const NAV_LOCKED: readonly NavKey[] = ["dashboard", "admin"];

export interface NavSettings {
  order: NavKey[];
  hidden: NavKey[];
}

export const DEFAULT_HOME: HomeSettings = { cardOrder: HOME_CARDS.map((c) => c.key), hidden: [] };
export const DEFAULT_NAV: NavSettings = { order: [...NAV_KEYS], hidden: [] };

function orderedSubset<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  const seen = new Set<T>();
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === "string" && (allowed as readonly string[]).includes(value) && !seen.has(value as T)) {
        seen.add(value as T);
      }
    }
  }
  return [...seen];
}

function completeOrder<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  const head = orderedSubset(raw, allowed);
  return [...head, ...allowed.filter((key) => !head.includes(key))];
}

export function normalizeHome(raw: unknown): HomeSettings {
  const value = (raw ?? {}) as Partial<Record<keyof HomeSettings, unknown>>;
  const hideable = [...HOME_CARDS.map((c) => c.key), ...HOME_BLOCKS.map((b) => b.key)] as (HomeCardKey | HomeBlockKey)[];
  return {
    cardOrder: completeOrder(value.cardOrder, HOME_CARDS.map((c) => c.key)),
    hidden: orderedSubset(value.hidden, hideable),
  };
}

export function normalizeNav(raw: unknown): NavSettings {
  const value = (raw ?? {}) as Partial<Record<keyof NavSettings, unknown>>;
  return {
    order: completeOrder(value.order, NAV_KEYS),
    hidden: orderedSubset(value.hidden, NAV_KEYS).filter((key) => !NAV_LOCKED.includes(key)),
  };
}

/** 메뉴에 설정을 적용한다: 숨긴 메뉴를 빼고, 같은 구역 안에서 설정 순서대로 정렬한다 (구역 순서는 유지). */
export function applyNav<T extends { key: string; section: string }>(items: T[], settings: NavSettings): T[] {
  const sections = [...new Set(items.map((item) => item.section))];
  const rank = (key: string) => {
    const index = (settings.order as string[]).indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return sections.flatMap((section) =>
    items
      .filter((item) => item.section === section && !(settings.hidden as string[]).includes(item.key))
      .sort((a, b) => rank(a.key) - rank(b.key)),
  );
}

/** 보이는 홈 카드를 설정 순서대로. */
export function visibleHomeCards(settings: HomeSettings): HomeCardKey[] {
  return settings.cardOrder.filter((key) => !settings.hidden.includes(key));
}

export const isHomeBlockVisible = (settings: HomeSettings, key: HomeBlockKey) => !settings.hidden.includes(key);
