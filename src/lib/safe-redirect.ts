export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * 로그인 후 이동할 경로를 검증한다 (오픈 리다이렉트 방지).
 * 같은 사이트의 단일 슬래시 상대 경로만 허용하고, 로그인 페이지 자신은 제외한다.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    return DEFAULT_AFTER_LOGIN;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (decoded.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(decoded)) {
    return DEFAULT_AFTER_LOGIN;
  }
  const pathname = value.split(/[?#]/)[0];
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return value;
}
