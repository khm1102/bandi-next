import { DomainError, type ErrorKind } from "@/features/member/errors";

function kinded(kind: ErrorKind, code: string, defaultMessage: string) {
  return class extends DomainError {
    override readonly kind = kind;
    constructor(message: string = defaultMessage) {
      super(code, message);
    }
  };
}

export class InvalidFileError extends kinded("invalid", "FI001", "업로드할 수 없는 파일입니다.") {
  constructor(readonly reason: string) {
    super();
  }
}
export class FileTooLargeError extends kinded("invalid", "FI002", "파일이 너무 큽니다.") {}
export class FileAccessDeniedError extends kinded("forbidden", "FI003", "파일에 접근할 권한이 없습니다.") {}
export class StoredFileNotFoundError extends kinded("not-found", "FI004", "파일을 찾을 수 없습니다.") {}
export class InvalidFileStateError extends kinded("conflict", "FI005", "사용할 수 없는 파일 상태입니다.") {}
export class FileStorageUnavailableError extends kinded("invalid", "FI006", "파일 저장소를 사용할 수 없습니다.") {}
