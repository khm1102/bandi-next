import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

/**
 * 요청마다 CSP nonce를 만들고, 세션 쿠키가 없으면 로그인으로 보내는 낙관적 리다이렉트(UX 보조)를 한다.
 * 인가의 근거가 아니다: 실제 인증·인가는 모든 페이지·액션·핸들러가 서버에서
 * requirePrincipal()/서비스 정책으로 다시 검사한다.
 */
const PUBLIC_PREFIXES = ["/login", "/share", "/privacy", "/support", "/_next", "/favicon.ico", "/manifest.webmanifest", "/service-worker.js", "/images"];

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);

  const { pathname, search } = request.nextUrl;
  if (pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return next();
  }
  if (request.cookies.has("bandi_session")) {
    return next();
  }
  if (pathname.startsWith("/api/")) {
    return withCsp(NextResponse.json({ code: "AUTH_REQUIRED", message: "로그인이 필요합니다." }, { status: 401 }), csp);
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return withCsp(NextResponse.redirect(url), csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp|js|css)$).*)"],
};
