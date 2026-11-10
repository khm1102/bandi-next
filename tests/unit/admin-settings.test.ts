import { describe, expect, it } from "vitest";
import {
  applyNav,
  DEFAULT_HOME,
  DEFAULT_NAV,
  isHomeBlockVisible,
  NAV_KEYS,
  normalizeHome,
  normalizeNav,
  visibleHomeCards,
} from "@/features/admin/settings-model";

describe("홈 설정 정규화", () => {
  it("값이 없으면 원본 배치(일정 → 공지 → 빠른 이동, 모두 표시)", () => {
    expect(normalizeHome(undefined)).toEqual(DEFAULT_HOME);
    expect(normalizeHome(null)).toEqual(DEFAULT_HOME);
    expect(DEFAULT_HOME.cardOrder).toEqual(["schedule", "notices", "quick"]);
  });
  it("모르는 키·중복은 버리고 빠진 카드는 기본 순서대로 뒤에 붙인다", () => {
    expect(normalizeHome({ cardOrder: ["quick", "evil", "quick", 3], hidden: ["<script>", "stats", "stats"] })).toEqual({
      cardOrder: ["quick", "schedule", "notices"],
      hidden: ["stats"],
    });
  });
  it("형식이 틀린 값(문자열·객체)은 기본값으로 처리한다", () => {
    expect(normalizeHome({ cardOrder: "schedule", hidden: { a: 1 } })).toEqual(DEFAULT_HOME);
  });
  it("숨긴 카드는 보이는 목록에서 빠지고 블록 표시 여부를 판단한다", () => {
    const settings = normalizeHome({ cardOrder: ["notices", "schedule", "quick"], hidden: ["schedule", "attention"] });
    expect(visibleHomeCards(settings)).toEqual(["notices", "quick"]);
    expect(isHomeBlockVisible(settings, "attention")).toBe(false);
    expect(isHomeBlockVisible(settings, "stats")).toBe(true);
  });
});

describe("메뉴 설정", () => {
  it("값이 없으면 전체 메뉴를 기본 순서로", () => {
    expect(normalizeNav(undefined)).toEqual(DEFAULT_NAV);
    expect(DEFAULT_NAV.order).toEqual([...NAV_KEYS]);
  });
  it("홈과 운영 관리는 숨길 수 없다", () => {
    expect(normalizeNav({ hidden: ["dashboard", "admin", "props"] }).hidden).toEqual(["props"]);
  });
  it("같은 구역 안에서만 순서를 바꾸고 구역 순서는 유지하며, 숨긴 메뉴는 뺀다", () => {
    const items = [
      { key: "dashboard", section: "기본" },
      { key: "onboarding", section: "기본" },
      { key: "calendar", section: "동아리" },
      { key: "notices", section: "동아리" },
      { key: "resources", section: "동아리" },
      { key: "props", section: "관리" },
    ];
    const settings = normalizeNav({ order: ["props", "resources", "calendar", "notices", "onboarding", "dashboard"], hidden: ["notices"] });
    expect(applyNav(items, settings).map((i) => i.key)).toEqual(["onboarding", "dashboard", "resources", "calendar", "props"]);
  });
});
