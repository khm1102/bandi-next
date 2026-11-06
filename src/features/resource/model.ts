import { DomainError } from "@/features/member/errors";

export class InvalidResourceError extends DomainError {
  constructor(message = "자료 입력값이 올바르지 않습니다.") {
    super("INVALID_RESOURCE", message);
  }
}
export class ResourceAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("RESOURCE_ACCESS_DENIED", "자료에 접근할 권한이 없습니다.");
  }
}
export class ResourceNotFoundError extends DomainError {
  override readonly kind = "not-found" as const;
  constructor() {
    super("RESOURCE_NOT_FOUND", "자료를 찾을 수 없습니다.");
  }
}

export function validateResourceFields(input: { title: string; body: string }): { title: string; body: string } {
  const title = input.title?.trim();
  if (!title || title.length > 200) throw new InvalidResourceError("제목은 1~200자로 입력해 주세요.");
  if (!input.body || input.body.trim() === "") throw new InvalidResourceError("본문을 입력해 주세요.");
  return { title, body: input.body };
}
