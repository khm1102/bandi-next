"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authService } from "@/features/member/auth-instance";
import { LoginError } from "@/features/member/errors";
import { GENERIC_LOGIN_ERROR, PASSWORD_LOGIN_ERROR_TEXT } from "@/features/member/messages";
import { endSession, startSession } from "@/lib/session";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { logger } from "@/lib/logger";
import { runMaintenanceIfDue } from "@/lib/maintenance";
import { loginThrottled } from "./throttle";

const loginSchema = z.object({
  studentNo: z
    .string()
    .trim()
    .min(1, "학번을 입력해 주세요.")
    .max(20, "학번이 너무 깁니다.")
    .regex(/^\d+$/, "학번은 숫자로 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요.").max(200, "비밀번호가 너무 깁니다."),
});

export interface LoginFormState {
  title: string | null;
  message: string | null;
  studentNo: string;
}

/** 반디 계정 로그인(학번 + 비밀번호). 학교 서버는 호출하지 않는다. 서버 액션도 공개 엔드포인트이므로 입력을 서버에서 검증한다. */
export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const rawStudentNo = String(formData.get("studentNo") ?? "");
  const parsed = loginSchema.safeParse({ studentNo: rawStudentNo, password: formData.get("password") });
  if (!parsed.success) {
    return { title: "입력 확인 필요", message: parsed.error.issues[0].message, studentNo: rawStudentNo.slice(0, 20) };
  }

  runMaintenanceIfDue();
  if (await loginThrottled("login")) {
    return { ...PASSWORD_LOGIN_ERROR_TEXT["login-rate-limited"], studentNo: parsed.data.studentNo };
  }

  let memberId: number;
  try {
    ({ memberId } = await authService().loginWithPassword(parsed.data));
  } catch (error) {
    if (error instanceof LoginError) {
      // 학번·비밀번호는 로그에 남기지 않는다.
      logger.info("로그인 거부", { code: error.loginCode });
      return { ...PASSWORD_LOGIN_ERROR_TEXT[error.loginCode], studentNo: parsed.data.studentNo };
    }
    logger.error("로그인 처리 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
    return { ...GENERIC_LOGIN_ERROR, studentNo: parsed.data.studentNo };
  }

  await startSession(memberId);
  redirect(safeRedirectPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
