"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { adminService } from "./instance";

const id = z.coerce.number().int().positive();
const strings = (formData: FormData, name: string) => formData.getAll(name).map(String);

/** 홈 화면 설정 저장. 값은 서버가 허용 목록으로 정규화한다. */
export async function saveHomeSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/admin/settings");
  const result = await runAction(async () => {
    await adminService().saveHome(principal.memberId, { cardOrder: strings(formData, "cardOrder"), hidden: strings(formData, "hidden") });
    return "홈 화면 설정을 저장했습니다.";
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function saveNavSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/admin/settings");
  const result = await runAction(async () => {
    await adminService().saveNav(principal.memberId, { order: strings(formData, "order"), hidden: strings(formData, "hidden") });
    return "메뉴 설정을 저장했습니다.";
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function resetSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/admin/settings");
  const key = formData.get("key") === "nav" ? "nav" : "home";
  const result = await runAction(async () => {
    await adminService().resetSettings(principal.memberId, key);
    return "기본값으로 되돌렸습니다.";
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function unlockLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/admin/accounts");
  const result = await runAction(async () => {
    await adminService().unlockLogin(principal.memberId, id.parse(formData.get("memberId")));
    return "로그인 잠금을 해제했습니다.";
  });
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function requirePasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/admin/accounts");
  const result = await runAction(async () => {
    await adminService().requirePasswordReset(principal.memberId, id.parse(formData.get("memberId")), String(formData.get("reason") ?? ""));
    return "비밀번호 재설정을 요구했습니다. 해당 멤버는 학교 계정 인증 후 새 비밀번호를 정해야 해요.";
  });
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}
