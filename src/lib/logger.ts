import "server-only";

type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * 구조화 로그. 사용자 입력·파일명·학번·비밀번호는 필드로 넘기지 않는다.
 * 개발 진단은 debug, 비즈니스 이벤트만 info.
 */
function write(level: "debug" | "info" | "warn" | "error", message: string, fields?: Fields): void {
  if (level === "debug" && process.env.NODE_ENV === "production") {
    return;
  }
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
