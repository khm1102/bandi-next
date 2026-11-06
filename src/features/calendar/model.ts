import { DomainError, InvalidInputError } from "@/features/member/errors";
import { EVENT_COLORS, type EventColor } from "./schema";

export class CalendarAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("CALENDAR_ACCESS_DENIED", "일정을 관리할 권한이 없습니다.");
  }
}
export class CalendarEventNotFoundError extends DomainError {
  override readonly kind = "not-found" as const;
  constructor() {
    super("CALENDAR_EVENT_NOT_FOUND", "일정을 찾을 수 없습니다.");
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 한국 시간(Asia/Seoul) 자정인지. */
export function isMidnightKst(date: Date): boolean {
  return (((date.getTime() + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS === 0;
}

export interface EventInput {
  teamId: number | null;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  place?: string | null;
  color?: string | null;
}

export interface ValidEvent {
  teamId: number | null;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  place: string | null;
  color: EventColor;
}

/**
 * 일정 입력 검증. 종일 일정은 시작일 00:00(KST)부터 마지막 날 다음 날 00:00(KST)까지의
 * 배타적 종료 구간이어야 한다.
 */
export function validateEvent(input: EventInput, defaultColor: EventColor = "NAVY"): ValidEvent {
  const title = input.title?.trim();
  if (!title || title.length > 150) {
    throw new InvalidInputError("일정명은 1~150자로 입력해 주세요.");
  }
  const description = input.description?.trim() || null;
  const place = input.place?.trim() || null;
  if (place && place.length > 200) {
    throw new InvalidInputError("장소는 200자 이하로 입력해 주세요.");
  }
  const color = (input.color ?? defaultColor) as EventColor;
  if (!EVENT_COLORS.includes(color)) {
    throw new InvalidInputError("표시 색상이 올바르지 않습니다.");
  }
  if (Number.isNaN(input.startAt.getTime()) || Number.isNaN(input.endAt.getTime()) || input.endAt <= input.startAt) {
    throw new InvalidInputError("종료 시각은 시작 시각보다 늦어야 합니다.");
  }
  if (input.isAllDay && (!isMidnightKst(input.startAt) || !isMidnightKst(input.endAt))) {
    throw new InvalidInputError("종일 일정은 날짜 단위로 입력해 주세요.");
  }
  return { teamId: input.teamId, title, description, startAt: input.startAt, endAt: input.endAt, isAllDay: input.isAllDay, place, color };
}
