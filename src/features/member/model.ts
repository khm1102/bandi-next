import type { MemberStatus, Role } from "./codes";
import {
  ChangeReasonRequiredError,
  InvalidStatusTransitionError,
  NoChangeError,
  SelfRoleDemotionError,
} from "./errors";

const MAX_REASON_LENGTH = 500;

/** 변경 사유 검증 (필수, 공백 제거, 500자 이하). 정규화된 사유를 반환한다. */
export function validateReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new ChangeReasonRequiredError();
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ChangeReasonRequiredError(`변경 사유는 ${MAX_REASON_LENGTH}자 이하로 입력해 주세요.`);
  }
  return trimmed;
}

export function validateTeamChange(currentTeamId: number, newTeamId: number): void {
  if (currentTeamId === newTeamId) {
    throw new NoChangeError("이미 같은 팀입니다.");
  }
}

export function validateCohortChange(currentCohortId: number, newCohortId: number): void {
  if (currentCohortId === newCohortId) {
    throw new NoChangeError("이미 같은 기수입니다.");
  }
}

/** 본인의 ADMIN 권한 하향은 다른 ADMIN만 할 수 있다 (ADMIN에서 벗어나는 변경은 모두 하향). */
export function validateRoleChange(
  target: { memberId: number; role: Role },
  newRole: Role,
  actorMemberId: number,
): void {
  if (target.role === newRole) {
    throw new NoChangeError("이미 같은 권한입니다.");
  }
  if (target.role === "ADMIN" && target.memberId === actorMemberId) {
    throw new SelfRoleDemotionError();
  }
}

export function canTransitionByAdmin(from: MemberStatus, to: MemberStatus): boolean {
  switch (from) {
    case "PRE_REGISTERED":
      return to === "REGISTRATION_CANCELLED";
    case "ACTIVE":
      return to === "SUSPENDED" || to === "WITHDRAWN";
    case "SUSPENDED":
      return to === "ACTIVE" || to === "WITHDRAWN";
    case "WITHDRAWN":
      return to === "ACTIVE";
    case "REGISTRATION_CANCELLED":
      return false;
  }
}

export function validateStatusChange(current: MemberStatus, next: MemberStatus): void {
  if (current === next) {
    throw new NoChangeError("이미 같은 상태입니다.");
  }
  if (!canTransitionByAdmin(current, next)) {
    throw new InvalidStatusTransitionError();
  }
}
