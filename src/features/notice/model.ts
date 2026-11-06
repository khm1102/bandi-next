import { DomainError } from "@/features/member/errors";
import type { NoticeScope, NoticeStatus } from "./schema";

export class InvalidNoticeError extends DomainError {
  constructor(message = "공지 입력값이 올바르지 않습니다.") {
    super("INVALID_NOTICE", message);
  }
}
export class InvalidNoticeStateError extends DomainError {
  override readonly kind = "conflict" as const;
  constructor(status: NoticeStatus) {
    super("INVALID_NOTICE_STATE", `현재 상태(${status})에서는 처리할 수 없습니다.`);
  }
}
export class NoticeAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("NOTICE_ACCESS_DENIED", "공지에 접근할 권한이 없습니다.");
  }
}
export class NoticeNotFoundError extends DomainError {
  override readonly kind = "not-found" as const;
  constructor() {
    super("NOTICE_NOT_FOUND", "공지를 찾을 수 없습니다.");
  }
}

export const canEdit = (s: NoticeStatus) => s === "DRAFT" || s === "SCHEDULED" || s === "PUBLISHED";
export const canPublish = canEdit;
export const canClose = (s: NoticeStatus) => s === "SCHEDULED" || s === "PUBLISHED";
export const canArchive = (s: NoticeStatus) => s === "CLOSED";
export const canReturnToDraft = (s: NoticeStatus) => s === "SCHEDULED" || s === "ARCHIVED";
export const canDelete = (s: NoticeStatus) => s === "DRAFT";
/** 공유 링크는 게시(예약 포함) 상태에서만 유효하다. */
export const canBePublic = (s: NoticeStatus) => s === "SCHEDULED" || s === "PUBLISHED";

export interface NoticeFields {
  targetScope: NoticeScope;
  teamId: number | null;
  title: string;
  body: string;
  important: boolean;
}

/** 대상 범위·제목·본문 검증 (ALL은 팀 없음, TEAM은 팀 필수). 정규화된 값을 반환한다. */
export function validateNoticeFields(input: NoticeFields): NoticeFields {
  const title = input.title?.trim();
  if (input.targetScope !== "ALL" && input.targetScope !== "TEAM") {
    throw new InvalidNoticeError("공지 대상이 올바르지 않습니다.");
  }
  if ((input.targetScope === "ALL") !== (input.teamId === null)) {
    throw new InvalidNoticeError("전체 공지는 팀을 지정할 수 없고, 팀 공지는 팀이 필요합니다.");
  }
  if (!title || title.length > 200) {
    throw new InvalidNoticeError("제목은 1~200자로 입력해 주세요.");
  }
  if (!input.body || input.body.trim() === "") {
    throw new InvalidNoticeError("본문을 입력해 주세요.");
  }
  return { ...input, title };
}

export interface PublishPlan {
  status: "SCHEDULED" | "PUBLISHED";
  publishStartAt: Date;
  publishEndAt: Date | null;
}

/** 게시 시각이 미래면 SCHEDULED, 아니면 PUBLISHED. 종료가 시작보다 빠르면 거부한다. */
export function planPublish(current: NoticeStatus, requestedStart: Date | null, requestedEnd: Date | null, now: Date): PublishPlan {
  if (!canPublish(current)) {
    throw new InvalidNoticeStateError(current);
  }
  const start = requestedStart ?? now;
  if (requestedEnd && requestedEnd < start) {
    throw new InvalidNoticeError("게시 종료는 게시 시작보다 빠를 수 없습니다.");
  }
  return { status: start > now ? "SCHEDULED" : "PUBLISHED", publishStartAt: start, publishEndAt: requestedEnd };
}

/** 현재 시각에 멤버에게 보이는 게시 기간 안인지. */
export function isVisibleAt(
  notice: { status: NoticeStatus; publishStartAt: Date | null; publishEndAt: Date | null },
  now: Date,
): boolean {
  if (!canBePublic(notice.status) || !notice.publishStartAt || now < notice.publishStartAt) {
    return false;
  }
  return notice.publishEndAt === null || now < notice.publishEndAt;
}
