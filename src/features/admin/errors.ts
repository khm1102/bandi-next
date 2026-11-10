import { DomainError } from "@/features/member/errors";

export class AdminAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("ADMIN_ACCESS_DENIED", "운영진만 사용할 수 있는 기능입니다.");
  }
}

export class InvalidAdminInputError extends DomainError {
  constructor(message: string) {
    super("INVALID_ADMIN_INPUT", message);
  }
}
