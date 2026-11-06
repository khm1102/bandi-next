"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal } from "@/lib/session";
import { runAction, type ActionState } from "@/lib/action-result";
import { InvalidInputError } from "./errors";
import { memberService } from "./instance";
import { MEMBER_STATUSES, ROLES } from "./codes";

const id = z.coerce.number().int().positive();
const reason = z.string().max(600);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new InvalidInputError();
  }
  return result.data;
}

const fields = (formData: FormData) => Object.fromEntries(formData.entries());

export async function changeTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(z.object({ memberId: id, newTeamId: id, reason }), fields(formData));
    await memberService().changeTeam(principal.memberId, input);
    revalidatePath("/", "layout");
    return "팀을 변경했습니다.";
  });
}

export async function changeCohortAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(z.object({ memberId: id, newCohortId: id, reason }), fields(formData));
    await memberService().changeCohort(principal.memberId, input);
    revalidatePath("/", "layout");
    return "기수를 변경했습니다.";
  });
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(z.object({ memberId: id, newRole: z.enum(ROLES), reason }), fields(formData));
    await memberService().changeRole(principal.memberId, input);
    revalidatePath("/", "layout");
    return "권한을 변경했습니다.";
  });
}

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(z.object({ memberId: id, newStatus: z.enum(MEMBER_STATUSES), reason }), fields(formData));
    await memberService().changeStatus(principal.memberId, input);
    revalidatePath("/", "layout");
    return "상태를 변경했습니다.";
  });
}

export async function preRegisterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(
      z.object({ studentNo: z.string().max(20), name: z.string().max(50), teamId: id, cohortId: id }),
      fields(formData),
    );
    await memberService().preRegister(principal.memberId, input);
    revalidatePath("/members");
    return "사전 등록했습니다.";
  });
}

export async function createCohortAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal();
  return runAction(async () => {
    const input = parse(z.object({ name: z.string().max(30) }), fields(formData));
    await memberService().createCohort(principal.memberId, input.name);
    revalidatePath("/members");
    return "기수를 추가했습니다.";
  });
}
