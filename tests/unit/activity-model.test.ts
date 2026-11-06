import { describe, expect, it } from "vitest";
import { canArchive, canEdit, canFinalApprove, canRequestRevision, canSubmit, canTeamApprove, csvCell, isArchiveReadable, validateActivityFields } from "@/features/activity/model";
import { ACTIVITY_STATUSES, type ActivityStatus } from "@/features/activity/schema";

const only = (predicate: (s: ActivityStatus) => boolean) => ACTIVITY_STATUSES.filter(predicate);

describe("활동 기록 상태 규칙", () => {
  it("수정·제출은 초안과 보완 요청 상태에서만 가능하다", () => {
    expect(only(canEdit)).toEqual(["DRAFT", "REVISION_REQUESTED"]);
    expect(only(canSubmit)).toEqual(["DRAFT", "REVISION_REQUESTED"]);
  });
  it("1차 승인은 제출됨만, 최종 승인은 1차 승인됨 또는 (긴급) 제출됨", () => {
    expect(only(canTeamApprove)).toEqual(["SUBMITTED"]);
    expect(only(canFinalApprove).sort()).toEqual(["SUBMITTED", "TEAM_APPROVED"]);
  });
  it("보완 요청은 제출됨·1차 승인됨, 보관은 최종 승인됨만, 보관함 열람도 최종 승인됨만", () => {
    expect(only(canRequestRevision).sort()).toEqual(["SUBMITTED", "TEAM_APPROVED"]);
    expect(only(canArchive)).toEqual(["APPROVED"]);
    expect(only(isArchiveReadable)).toEqual(["APPROVED"]);
  });
});

describe("활동 기록 입력 검증", () => {
  const base = { teamId: 3, activityAt: new Date("2026-11-01T00:00:00Z"), title: " 제목 ", body: "내용", participantCount: 3 };
  it("제목을 다듬어 반환한다", () => {
    expect(validateActivityFields(base).title).toBe("제목");
  });
  it("빈 제목·긴 제목·빈 내용·0명·소수 인원·잘못된 일시를 거부한다", () => {
    expect(() => validateActivityFields({ ...base, title: " " })).toThrow();
    expect(() => validateActivityFields({ ...base, title: "가".repeat(151) })).toThrow();
    expect(() => validateActivityFields({ ...base, body: "  " })).toThrow();
    expect(() => validateActivityFields({ ...base, participantCount: 0 })).toThrow();
    expect(() => validateActivityFields({ ...base, participantCount: 1.5 })).toThrow();
    expect(() => validateActivityFields({ ...base, activityAt: new Date("x") })).toThrow();
  });
});

describe("csvCell (수식 주입 방지)", () => {
  it("= + - @ 로 시작하는 값에 작은따옴표를 붙인다", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
  });
  it("따옴표를 이중화하고 개행은 공백으로 바꾼다", () => {
    expect(csvCell('say "hi"\nnext')).toBe('"say ""hi"" next"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });
});
