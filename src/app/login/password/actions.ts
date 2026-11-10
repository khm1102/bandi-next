"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authService } from "@/features/member/auth-instance";
import { LoginError } from "@/features/member/errors";
import { GENERIC_LOGIN_ERROR, LOGIN_ERROR_TEXT } from "@/features/member/messages";
import { InvalidPasswordError } from "@/features/member/password";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { startSession } from "@/lib/session";
import { SETUP_COOKIE } from "../throttle";

export interface PasswordFormState {
  title: string | null;
  message: string | null;
  /** 티켓이 만료돼 학교 인증부터 다시 해야 하는 경우 */
  restart: boolean;
}

/** 학교 인증 티켓으로 반디 비밀번호를 정하고 바로 로그인한다. 정책은 서버가 다시 검사한다. */
export async function setPasswordAction(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const jar = await cookies();
  const token = jar.get(SETUP_COOKIE)?.value;
  if (!token) {
    redirect(`/login/verify?expired=1&next=${encodeURIComponent(safeRedirectPath(formData.get("next")))}`);
  }
  let memberId: number;
  try {
    ({ memberId } = await authService().setPasswordWithTicket(token, String(formData.get("password") ?? ""), String(formData.get("confirm") ?? "")));
  } catch (error) {
    if (error instanceof InvalidPasswordError) {
      return { title: "비밀번호를 확인해 주세요", message: error.message, restart: false };
    }
    if (error instanceof LoginError) {
      logger.info("비밀번호 설정 거부", { code: error.loginCode });
      if (error.loginCode === "password-setup-expired") {
        // 쿠키를 지우면 화면이 다시 그려지며 학교 인증으로 넘어가므로, 만료 안내를 그 화면에 함께 넘긴다.
        jar.delete({ name: SETUP_COOKIE, path: "/login" });
        redirect(`/login/verify?expired=1&next=${encodeURIComponent(safeRedirectPath(formData.get("next")))}`);
      }
      return { ...LOGIN_ERROR_TEXT[error.loginCode], restart: false };
    }
    logger.error("비밀번호 설정 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
    return { ...GENERIC_LOGIN_ERROR, restart: false };
  }
  // 발급할 때와 같은 경로로 지워야 브라우저에서 실제로 삭제된다.
  jar.delete({ name: SETUP_COOKIE, path: "/login" });
  await startSession(memberId);
  redirect(safeRedirectPath(formData.get("next")));
}
