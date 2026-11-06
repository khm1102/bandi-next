import { describe, expect, it } from "vitest";
import { eventDays, monthGrid, monthRange, parseKst, parseMonth, shiftMonth, toKstDate, toKstDateTimeInput } from "@/lib/kst";

describe("KST 변환", () => {
  it("KST 입력값을 UTC 시각으로 해석한다", () => {
    expect(parseKst("2026-11-20T10:30").toISOString()).toBe("2026-11-20T01:30:00.000Z");
    expect(parseKst("2026-11-20").toISOString()).toBe("2026-11-19T15:00:00.000Z");
  });

  it("잘못된 값은 Invalid Date다 (존재하지 않는 날짜 포함)", () => {
    for (const bad of ["", "2026-13-01", "2026-02-30", "abc", "2026-11-20 10:30", null, undefined]) {
      expect(Number.isNaN(parseKst(bad as never).getTime())).toBe(true);
    }
  });

  it("입력용 문자열로 되돌려도 같다 (왕복)", () => {
    const date = parseKst("2026-01-01T00:00");
    expect(toKstDateTimeInput(date)).toBe("2026-01-01T00:00");
    expect(toKstDate(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  it("월 범위는 KST 자정 기준이다", () => {
    const { start, end } = monthRange(2026, 11);
    expect(start.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-30T15:00:00.000Z");
  });

  it("월 파라미터를 검증하고 이동한다", () => {
    expect(parseMonth("2026-03", new Date())).toEqual({ year: 2026, month: 3 });
    expect(parseMonth("2026-13", new Date("2026-11-07T00:00:00Z"))).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("월간 그리드는 일요일 시작 7의 배수이며 해당 월을 모두 포함한다", () => {
    const grid = monthGrid(2026, 11);
    expect(grid.length % 7).toBe(0);
    expect(grid[0].date).toBe("2026-11-01"); // 2026-11-01은 일요일
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("일정이 걸친 날짜를 계산한다 (종일 일정의 배타적 종료 포함)", () => {
    expect(eventDays(parseKst("2026-11-20"), parseKst("2026-11-22"))).toEqual(["2026-11-20", "2026-11-21"]);
    expect(eventDays(parseKst("2026-11-20T23:00"), parseKst("2026-11-21T01:00"))).toEqual(["2026-11-20", "2026-11-21"]);
    expect(eventDays(parseKst("2026-11-20T10:00"), parseKst("2026-11-20T11:00"))).toEqual(["2026-11-20"]);
  });
});
