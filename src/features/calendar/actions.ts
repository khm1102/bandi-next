"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { parseKst } from "@/lib/kst";
import { InvalidInputError } from "@/features/member/errors";
import { calendarService } from "./instance";
import { EVENT_COLORS } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const schema = z.object({
  teamId: z.string().optional(),
  title: z.string().max(200),
  description: z.string().max(5000).optional(),
  place: z.string().max(300).optional(),
  color: z.enum(EVENT_COLORS).optional(),
  allDay: z.string().optional(),
  start: z.string(),
  end: z.string(),
});

/** 폼 값을 일정 입력으로 변환한다. 종일 일정은 마지막 날을 포함하도록 종료를 다음 날 00:00(KST)로 저장한다. */
function toInput(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new InvalidInputError();
  }
  const v = parsed.data;
  const isAllDay = v.allDay === "on";
  const startAt = parseKst(isAllDay ? v.start.slice(0, 10) : v.start);
  const endBase = parseKst(isAllDay ? v.end.slice(0, 10) : v.end);
  const endAt = isAllDay && !Number.isNaN(endBase.getTime()) ? new Date(endBase.getTime() + DAY_MS) : endBase;
  const teamId = v.teamId && v.teamId !== "all" ? Number(v.teamId) : null;
  if (teamId !== null && !Number.isSafeInteger(teamId)) {
    throw new InvalidInputError();
  }
  return { teamId, title: v.title, description: v.description, place: v.place, color: v.color, isAllDay, startAt, endAt };
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/calendar");
  const result = await runAction(async () => {
    await calendarService().create(principal.memberId, toInput(formData));
  });
  if (result.ok) {
    revalidatePath("/calendar");
    redirect("/calendar");
  }
  return result;
}

export async function updateEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/calendar");
  const id = Number(formData.get("eventId"));
  const result = await runAction(async () => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new InvalidInputError();
    await calendarService().update(principal.memberId, id, toInput(formData));
  });
  if (result.ok) {
    revalidatePath("/calendar");
    redirect("/calendar");
  }
  return result;
}

export async function deleteEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/calendar");
  const id = Number(formData.get("eventId"));
  const result = await runAction(async () => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new InvalidInputError();
    await calendarService().delete(principal.memberId, id);
  });
  if (result.ok) {
    revalidatePath("/calendar");
    redirect("/calendar");
  }
  return result;
}
