import "server-only";
import { Readable } from "node:stream";
import { DomainError, type ErrorKind } from "@/features/member/errors";
import { isSameOrigin, requiresCsrfCheck } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { getPrincipal } from "@/lib/session";
import type { Principal } from "@/lib/session-store";
import type { StoredObject } from "@/features/file/storage";

const STATUS: Record<ErrorKind, number> = { invalid: 400, forbidden: 403, "not-found": 404, conflict: 409 };

export function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 도메인 오류를 HTTP 응답으로 바꾼다. 예기치 않은 오류의 상세는 노출하지 않는다. */
export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return jsonError(error.code, error.message, STATUS[error.kind]);
  }
  logger.error("API 처리 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
  return jsonError("SERVER_ERROR", "처리 중 오류가 발생했습니다.", 500);
}

export type ApiHandler<C> = (request: Request, principal: Principal, context: C) => Promise<Response>;

/** 인증(401) + 상태 변경 요청의 출처 검증(403) + 오류 변환을 공통 적용한다. */
export function apiRoute<C>(handler: ApiHandler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      if (requiresCsrfCheck(request.method) && !isSameOrigin(request.headers)) {
        return jsonError("CSRF_REJECTED", "허용되지 않은 요청 출처입니다.", 403);
      }
      const principal = await getPrincipal();
      if (!principal) {
        return jsonError("AUTH_REQUIRED", "로그인이 필요합니다.", 401);
      }
      return await handler(request, principal, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** 한글 파일명을 안전하게 Content-Disposition에 담는다 (RFC 5987 + ASCII 대체 이름). */
export function contentDisposition(mode: "attachment" | "inline", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const INLINE_SAFE = new Set(["image/jpeg", "image/png", "image/webp"]);

export function fileResponse(
  object: StoredObject,
  file: { originalName: string; contentType: string },
  mode: "attachment" | "inline",
): Response {
  // 인라인은 이미지로 제한한다. 그 외 형식은 항상 다운로드로 강제해 브라우저가 해석하지 않게 한다.
  const effective = mode === "inline" && INLINE_SAFE.has(file.contentType) ? "inline" : "attachment";
  return new Response(Readable.toWeb(object.stream) as ReadableStream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(object.sizeBytes),
      "Content-Disposition": contentDisposition(effective, file.originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export function positiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
