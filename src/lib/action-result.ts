import "server-only";
import { DomainError } from "@/features/member/errors";
import { logger } from "@/lib/logger";

export interface ActionState {
  ok: boolean;
  message: string | null;
}

export const IDLE: ActionState = { ok: false, message: null };

/** 서버 액션의 오류를 사용자 메시지로 변환한다. 예기치 않은 오류의 상세는 노출하지 않는다. */
export async function runAction(work: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await work();
    return { ok: true, message: message ?? "저장했습니다." };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message };
    }
    // next/navigation의 redirect·notFound 등은 그대로 전파한다.
    if (error instanceof Error && "digest" in error) {
      throw error;
    }
    logger.error("액션 처리 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
