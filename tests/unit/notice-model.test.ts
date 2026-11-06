import { describe, expect, it } from "vitest";
import {
  canArchive, canClose, canDelete, canEdit, canPublish, canReturnToDraft,
  isVisibleAt, planPublish, validateNoticeFields,
} from "@/features/notice/model";
import type { NoticeStatus } from "@/features/notice/schema";

const ALL: NoticeStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "CLOSED", "ARCHIVED"];
const now = new Date("2026-11-07T00:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3600_000);

describe("공지 상태 전이 규칙", () => {
  it("수정·게시 가능: DRAFT, SCHEDULED, PUBLISHED", () => {
    expect(ALL.filter(canEdit)).toEqual(["DRAFT", "SCHEDULED", "PUBLISHED"]);
    expect(ALL.filter(canPublish)).toEqual(["DRAFT", "SCHEDULED", "PUBLISHED"]);
  });
  it("종료: SCHEDULED/PUBLISHED, 보관: CLOSED만", () => {
    expect(ALL.filter(canClose)).toEqual(["SCHEDULED", "PUBLISHED"]);
    expect(ALL.filter(canArchive)).toEqual(["CLOSED"]);
  });
  it("초안 복귀: SCHEDULED/ARCHIVED, 삭제: DRAFT만", () => {
    expect(ALL.filter(canReturnToDraft)).toEqual(["SCHEDULED", "ARCHIVED"]);
    expect(ALL.filter(canDelete)).toEqual(["DRAFT"]);
  });
});

describe("공지 입력 검증", () => {
  const base = { targetScope: "ALL" as const, teamId: null, title: " 제목 ", body: "본문", important: false };
  it("제목을 다듬어 반환한다", () => {
    expect(validateNoticeFields(base).title).toBe("제목");
  });
  it("ALL에 팀이 있거나 TEAM에 팀이 없으면 거부한다", () => {
    expect(() => validateNoticeFields({ ...base, teamId: 3 })).toThrow();
    expect(() => validateNoticeFields({ ...base, targetScope: "TEAM" })).toThrow();
    expect(validateNoticeFields({ ...base, targetScope: "TEAM", teamId: 3 }).teamId).toBe(3);
  });
  it("빈 제목·200자 초과 제목·빈 본문은 거부한다", () => {
    expect(() => validateNoticeFields({ ...base, title: "  " })).toThrow();
    expect(() => validateNoticeFields({ ...base, title: "가".repeat(201) })).toThrow();
    expect(() => validateNoticeFields({ ...base, body: "   " })).toThrow();
  });
});

describe("게시 계획", () => {
  it("시작을 생략하면 즉시 PUBLISHED, 미래면 SCHEDULED", () => {
    expect(planPublish("DRAFT", null, null, now)).toMatchObject({ status: "PUBLISHED", publishStartAt: now });
    expect(planPublish("DRAFT", hours(2), null, now).status).toBe("SCHEDULED");
  });
  it("종료가 시작보다 빠르면 거부한다", () => {
    expect(() => planPublish("DRAFT", hours(2), hours(1), now)).toThrow();
  });
  it("게시할 수 없는 상태에서는 거부한다", () => {
    expect(() => planPublish("CLOSED", null, null, now)).toThrow();
    expect(() => planPublish("ARCHIVED", null, null, now)).toThrow();
  });
});

describe("게시 기간 가시성", () => {
  const notice = (status: NoticeStatus, start: Date | null, end: Date | null) => ({ status, publishStartAt: start, publishEndAt: end });
  it("게시 중이고 기간 안일 때만 보인다", () => {
    expect(isVisibleAt(notice("PUBLISHED", hours(-1), null), now)).toBe(true);
    expect(isVisibleAt(notice("PUBLISHED", hours(1), null), now)).toBe(false);
    expect(isVisibleAt(notice("PUBLISHED", hours(-2), hours(-1)), now)).toBe(false);
    expect(isVisibleAt(notice("DRAFT", hours(-1), null), now)).toBe(false);
    expect(isVisibleAt(notice("CLOSED", hours(-1), null), now)).toBe(false);
  });
});
