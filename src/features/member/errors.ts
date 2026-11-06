/** 인증/멤버 도메인 예외. 코드는 로그인 화면의 오류 키(?error=...)로 매핑된다. */
export type LoginErrorCode =
  | "bad-credentials"
  | "login-rate-limited"
  | "member-not-registered"
  | "link-pending"
  | "academic-restricted"
  | "member-restricted"
  | "school-unavailable";

/** HTTP 상태로 매핑되는 오류 분류. */
export type ErrorKind = "invalid" | "forbidden" | "not-found" | "conflict";

export class DomainError extends Error {
  readonly kind: ErrorKind = "invalid";
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

export class LoginError extends DomainError {
  constructor(readonly loginCode: LoginErrorCode) {
    super(loginCode);
  }
}

export class SchoolCredentialsInvalidError extends LoginError {
  constructor() {
    super("bad-credentials");
  }
}
export class SchoolLoginRateLimitedError extends LoginError {
  constructor() {
    super("login-rate-limited");
  }
}
export class SchoolMemberNotRegisteredError extends LoginError {
  constructor() {
    super("member-not-registered");
  }
}
export class SchoolIdentityReviewRequiredError extends LoginError {
  constructor() {
    super("link-pending");
  }
}
export class SchoolAcademicStatusDeniedError extends LoginError {
  constructor() {
    super("academic-restricted");
  }
}
export class MemberLoginDeniedError extends LoginError {
  constructor() {
    super("member-restricted");
  }
}
export class SchoolSsoUnavailableError extends LoginError {
  constructor() {
    super("school-unavailable");
  }
}
export class SchoolSsoResponseChangedError extends LoginError {
  constructor() {
    super("school-unavailable");
  }
}

function kinded(kind: ErrorKind, code: string, defaultMessage: string) {
  return class extends DomainError {
    override readonly kind = kind;
    constructor(message: string = defaultMessage) {
      super(code, message);
    }
  };
}

export class ChangeReasonRequiredError extends kinded("invalid", "CHANGE_REASON_REQUIRED", "변경 사유를 입력해 주세요.") {}
export class NoChangeError extends kinded("invalid", "NO_CHANGE", "변경할 내용이 없습니다.") {}
export class SelfRoleDemotionError extends kinded("conflict", "SELF_ROLE_DEMOTION", "본인의 운영진 권한은 다른 운영진만 내릴 수 있습니다.") {}
export class InvalidStatusTransitionError extends kinded("conflict", "INVALID_STATUS_TRANSITION", "허용되지 않은 상태 변경입니다.") {}
export class LastActiveAdminError extends kinded("conflict", "LAST_ACTIVE_ADMIN", "마지막 운영진은 권한 해제나 비활성화를 할 수 없습니다.") {}
export class MemberManagementForbiddenError extends kinded("forbidden", "MEMBER_MANAGEMENT_FORBIDDEN", "멤버를 관리할 권한이 없습니다.") {}
export class MemberNotFoundError extends kinded("not-found", "MEMBER_NOT_FOUND", "멤버를 찾을 수 없습니다.") {}
export class DuplicateStudentNoError extends kinded("conflict", "DUPLICATE_STUDENT_NO", "이미 등록된 학번입니다.") {}
export class DuplicateCohortError extends kinded("conflict", "DUPLICATE_COHORT", "이미 존재하는 기수입니다.") {}
export class InvalidTeamError extends kinded("invalid", "INVALID_TEAM", "선택할 수 없는 팀입니다.") {}
export class InvalidCohortError extends kinded("invalid", "INVALID_COHORT", "선택할 수 없는 기수입니다.") {}
export class InvalidInputError extends kinded("invalid", "INVALID_INPUT", "입력값이 올바르지 않습니다.") {}
