import "server-only";
import { forbidden, notFound } from "next/navigation";
import { DomainError } from "@/features/member/errors";

/**
 * 페이지/레이아웃에서 서비스 호출 결과를 HTTP 의미로 변환한다.
 * forbidden → 403 화면, not-found → 404 화면, 그 외 오류는 그대로 던진다(500).
 */
export async function guard<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.kind === "forbidden") {
        forbidden();
      }
      if (error.kind === "not-found") {
        notFound();
      }
    }
    throw error;
  }
}
