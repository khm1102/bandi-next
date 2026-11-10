"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authService } from "@/features/member/auth-instance";
import { LoginError } from "@/features/member/errors";
import { GENERIC_LOGIN_ERROR, LOGIN_ERROR_TEXT } from "@/features/member/messages";
import { logger } from "@/lib/logger";
import { runMaintenanceIfDue } from "@/lib/maintenance";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { loginThrottled, SETUP_COOKIE, SETUP_COOKIE_MAX_AGE_SECONDS } from "../throttle";

const schema = z.object({
  studentNo: z.string().trim().min(1, "학번을 입력해 주세요.").max(20, "학번이 너무 깁니다.").regex(/^\d+$/, "학번은 숫자로 입력해 주세요."),
  password: z.string().min(1, "학교 포털 비밀번호를 입력해 주세요.").max(100, "비밀번호가 너무 깁니다."),
});

export interface VerifyFormState {
  title: string | null;
  message: string | null;
  studentNo: string;
}

/**
 * 학교 SSO로 본인과 재학 여부를 확인한다. 통과하면 학교 비밀번호는 즉시 버리고,
 * 10분짜리 일회용 티켓만 쿠키에 담아 반디 비밀번호 설정 화면으로 보낸다.
 */
export async function verifySchoolAction(_prev: VerifyFormState, formData: FormData): Promise<VerifyFormState> {
  const rawStudentNo = String(formData.get("studentNo") ?? "");
  const parsed = schema.safeParse({ studentNo: rawStudentNo, password: formData.get("password") });
  if (!parsed.success) {
    return { title: "입력 확인 필요", message: parsed.error.issues[0].message, studentNo: rawStudentNo.slice(0, 20) };
  }
  runMaintenanceIfDue();
  if (await loginThrottled("verify")) {
    return { ...LOGIN_ERROR_TEXT["login-rate-limited"], studentNo: parsed.data.studentNo };
  }

  let token: string;
  try {
    ({ token } = await authService().verifySchoolForPasswordSetup(parsed.data));
  } catch (error) {
    if (error instanceof LoginError) {
      logger.info("학교 인증 거부", { code: error.loginCode });
      return { ...LOGIN_ERROR_TEXT[error.loginCode], studentNo: parsed.data.studentNo };
    }
    logger.error("학교 인증 처리 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
    return { ...GENERIC_LOGIN_ERROR, studentNo: parsed.data.studentNo };
  }

  (await cookies()).set(SETUP_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/login",
    maxAge: SETUP_COOKIE_MAX_AGE_SECONDS,
  });
  const next = safeRedirectPath(formData.get("next"));
  redirect(`/login/password?next=${encodeURIComponent(next)}`);
}
