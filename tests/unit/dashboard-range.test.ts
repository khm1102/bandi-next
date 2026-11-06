import { describe, expect, it } from "vitest";
import { todayRange } from "@/features/dashboard/summary";

describe("todayRange (KST 하루 경계)", () => {
  it("UTC 15:00은 한국 날짜가 바뀌는 경계다", () => {
    const { start, end } = todayRange(new Date("2026-11-07T14:59:59Z")); // 11/07 23:59:59 KST
    expect(start.toISOString()).toBe("2026-11-06T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-07T15:00:00.000Z");
    const next = todayRange(new Date("2026-11-07T15:00:00Z")); // 11/08 00:00 KST
    expect(next.start.toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });
});
