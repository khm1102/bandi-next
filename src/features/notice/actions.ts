"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { parseKst } from "@/lib/kst";
import { InvalidInputError } from "@/features/member/errors";
import { noticeService } from "./instance";
import { NOTICE_SCOPES } from "./schema";

const idSchema = z.coerce.number().int().positive();

const writeSchema = z.object({
  targetScope: z.enum(NOTICE_SCOPES),
  teamId: z.string().optional(),
  title: z.string().max(400),
  body: z.string().max(200_000),
  important: z.string().optional(),
});

function toInput(formData: FormData) {
  const parsed = writeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new InvalidInputError();
  const v = parsed.data;
  const teamId = v.targetScope === "TEAM" ? Number(v.teamId) : null;
  if (teamId !== null && !Number.isSafeInteger(teamId)) throw new InvalidInputError();
  const attachmentFileIds = formData.getAll("attachmentFileId").map((value) => Number(value));
  if (attachmentFileIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new InvalidInputError();
  return { targetScope: v.targetScope, teamId, title: v.title, body: v.body, important: v.important === "on", attachmentFileIds };
}

export async function saveNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/notices/manage");
  let savedId: number | null = null;
  const result = await runAction(async () => {
    const rawId = formData.get("noticeId");
    if (rawId) {
      savedId = idSchema.parse(rawId);
      await noticeService().update(principal.memberId, savedId, toInput(formData));
    } else {
      savedId = await noticeService().createDraft(principal.memberId, toInput(formData));
    }
  });
  if (result.ok && savedId !== null) {
    revalidatePath("/notices", "layout");
    redirect(`/notices/manage/${savedId}`);
  }
  return result;
}

async function noticeCommand(formData: FormData, run: (memberId: number, noticeId: number) => Promise<string | void>, okMessage: string) {
  const principal = await requirePrincipal("/notices/manage");
  const result = await runAction(async () => {
    const id = idSchema.safeParse(formData.get("noticeId"));
    if (!id.success) throw new InvalidInputError();
    return (await run(principal.memberId, id.data)) ?? okMessage;
  });
  if (result.ok) revalidatePath("/notices", "layout");
  return result;
}

export async function publishNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const start = String(formData.get("publishStart") ?? "");
  const end = String(formData.get("publishEnd") ?? "");
  return noticeCommand(
    formData,
    async (memberId, id) => {
      const startAt = start ? parseKst(start) : null;
      const endAt = end ? parseKst(end) : null;
      if ((startAt && Number.isNaN(startAt.getTime())) || (endAt && Number.isNaN(endAt.getTime()))) throw new InvalidInputError();
      await noticeService().publish(memberId, id, { start: startAt, end: endAt });
    },
    "게시했습니다.",
  );
}
export const closeNoticeAction = async (_p: ActionState, f: FormData) =>
  noticeCommand(f, (m, id) => noticeService().close(m, id), "종료했습니다.");
export const archiveNoticeAction = async (_p: ActionState, f: FormData) =>
  noticeCommand(f, (m, id) => noticeService().archive(m, id), "보관했습니다.");
export const returnToDraftAction = async (_p: ActionState, f: FormData) =>
  noticeCommand(f, (m, id) => noticeService().returnToDraft(m, id), "초안으로 되돌렸습니다.");
export const revokeShareAction = async (_p: ActionState, f: FormData) =>
  noticeCommand(f, (m, id) => noticeService().revokeShare(m, id), "공유 링크를 중단했습니다.");

export async function deleteNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await noticeCommand(formData, (m, id) => noticeService().deleteDraft(m, id), "삭제했습니다.");
  if (result.ok) redirect("/notices/manage");
  return result;
}

/** 공유 링크 발급: 새 토큰 URL을 메시지로 돌려준다. 재발급하면 이전 링크는 무효가 된다. */
export async function issueShareAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return noticeCommand(
    formData,
    async (memberId, id) => {
      const token = await noticeService().issueShare(memberId, id);
      return `/share/notices/${token}`;
    },
    "",
  );
}

/** 작성 중 Markdown 미리보기. 반환 HTML은 서버 sanitizer를 통과한 값이다. */
export async function previewMarkdownAction(markdown: string, noticeId?: number): Promise<{ ok: boolean; html: string; message: string | null }> {
  const principal = await requirePrincipal("/notices/manage");
  try {
    const html = await noticeService().preview(principal.memberId, String(markdown).slice(0, 200_000), noticeId);
    return { ok: true, html: html.value, message: null };
  } catch {
    return { ok: false, html: "", message: "미리보기를 만들 수 없습니다." };
  }
}
