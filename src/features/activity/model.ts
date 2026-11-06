import { DomainError } from "@/features/member/errors";
import type { ActivityStatus } from "./schema";

export class InvalidActivityError extends DomainError {
  constructor(message = "활동 기록 입력값이 올바르지 않습니다.") {
    super("INVALID_ACTIVITY", message);
  }
}
export class InvalidActivityStateError extends DomainError {
  override readonly kind = "conflict" as const;
  constructor(status: ActivityStatus) {
    super("INVALID_ACTIVITY_STATE", `현재 상태(${status})에서는 처리할 수 없습니다.`);
  }
}
export class ActivityAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("ACTIVITY_ACCESS_DENIED", "활동 기록에 접근할 권한이 없습니다.");
  }
}
export class ActivityNotFoundError extends DomainError {
  override readonly kind = "not-found" as const;
  constructor() {
    super("ACTIVITY_NOT_FOUND", "활동 기록을 찾을 수 없습니다.");
  }
}

export const canEdit = (s: ActivityStatus) => s === "DRAFT" || s === "REVISION_REQUESTED";
export const canSubmit = canEdit;
export const canTeamApprove = (s: ActivityStatus) => s === "SUBMITTED";
export const canFinalApprove = (s: ActivityStatus) => s === "TEAM_APPROVED" || s === "SUBMITTED";
export const canRequestRevision = (s: ActivityStatus) => s === "SUBMITTED" || s === "TEAM_APPROVED";
export const canArchive = (s: ActivityStatus) => s === "APPROVED";
/** 전체 멤버가 열람하는 보관함에는 최종 승인된 기록만 보인다. */
export const isArchiveReadable = (s: ActivityStatus) => s === "APPROVED";

export interface ActivityFields {
  teamId: number;
  activityAt: Date;
  title: string;
  body: string;
  participantCount: number;
}

export function validateActivityFields(input: ActivityFields): ActivityFields {
  const title = input.title?.trim();
  if (!Number.isSafeInteger(input.teamId) || Number.isNaN(input.activityAt?.getTime())) {
    throw new InvalidActivityError("필수 항목이 비었습니다.");
  }
  if (!title || title.length > 150) throw new InvalidActivityError("제목은 1~150자로 입력해 주세요.");
  if (!input.body || input.body.trim() === "") throw new InvalidActivityError("내용을 입력해 주세요.");
  if (!Number.isInteger(input.participantCount) || input.participantCount < 1) {
    throw new InvalidActivityError("참여 인원은 1명 이상이어야 합니다.");
  }
  return { ...input, title };
}

/** CSV 셀: 수식 주입(= + - @) 방지 접두사와 따옴표 이스케이프, 개행 제거. */
export function csvCell(value: string | number | null | undefined): string {
  let text = (value === null || value === undefined ? "" : String(value)).replace(/[\r\n]+/g, " ");
  if (text !== "" && "=+-@".includes(text[0])) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
