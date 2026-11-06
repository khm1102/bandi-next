/**
 * 상태 변경 Route Handler용 CSRF 방어: Origin(또는 Referer)의 출처가 요청 Host와 같아야 한다.
 * SameSite=Lax 쿠키에 더해 쓰는 이중 방어이며, 서버 액션은 Next가 같은 검사를 내장한다.
 */
export function isSameOrigin(headers: Pick<Headers, "get">, forwardedHostTrusted = false): boolean {
  const host = (forwardedHostTrusted ? headers.get("x-forwarded-host") : null) ?? headers.get("host");
  if (!host) {
    return false;
  }
  const source = headers.get("origin") ?? refererOrigin(headers.get("referer"));
  if (!source || source === "null") {
    return false;
  }
  try {
    return new URL(source).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requiresCsrfCheck(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}
