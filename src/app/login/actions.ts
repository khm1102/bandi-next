"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authService } from "@/features/member/auth-instance";
import { LoginError } from "@/features/member/errors";
import { GENERIC_LOGIN_ERROR, LOGIN_ERROR_MESSAGES } from "@/features/member/messages";
import { endSession, startSession } from "@/lib/session";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { logger } from "@/lib/logger";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { runMaintenanceIfDue } from "@/lib/maintenance";
import { clientKey } from "@/lib/rate-limit";
import { hitShared } from "@/lib/rate-limit-db";

const loginSchema = z.object({
  studentNo: z
    .string()
    .trim()
    .min(1, "학번을 입력해 주세요.")
    .max(20, "학번이 너무 깁니다.")
    .regex(/^\d+$/, "학번은 숫자만 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요.").max(200, "비밀번호가 너무 깁니다."),
});

export interface LoginFormState {
  message: string | null;
  studentNo: string;
}

/** 로그인. 서버 액션도 공개 엔드포인트이므로 입력을 항상 서버에서 검증한다. */
export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const rawStudentNo = String(formData.get("studentNo") ?? "");
  const parsed = loginSchema.safeParse({
    studentNo: rawStudentNo,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0].message, studentNo: rawStudentNo.slice(0, 20) };
  }

  runMaintenanceIfDue();
  // 학번별 잠금(DB)과 별개로 IP당 요청 속도를 제한한다.
  const rate = await hitShared(db, `login:${clientKey(await headers(), env().TRUST_PROXY)}`, { limit: env().TRUST_PROXY ? 20 : 200, windowMs: 60_000 });
  if (!rate.allowed) {
    return { message: LOGIN_ERROR_MESSAGES["login-rate-limited"], studentNo: parsed.data.studentNo };
  }

  let memberId: number;
  try {
    ({ memberId } = await authService().authenticate(parsed.data));
  } catch (error) {
    if (error instanceof LoginError) {
      // 학번·비밀번호는 로그에 남기지 않는다.
      logger.info("로그인 거부", { code: error.loginCode });
      return { message: LOGIN_ERROR_MESSAGES[error.loginCode], studentNo: parsed.data.studentNo };
    }
    logger.error("로그인 처리 중 예기치 않은 오류", { error: error instanceof Error ? error.name : "unknown" });
    return { message: GENERIC_LOGIN_ERROR, studentNo: parsed.data.studentNo };
  }

  await startSession(memberId);
  redirect(safeRedirectPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
