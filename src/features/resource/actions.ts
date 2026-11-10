"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { InvalidInputError } from "@/features/member/errors";
import { renderMarkdown } from "@/features/notice/markdown";
import { resourceService } from "./instance";

const schema = z.object({ title: z.string().max(400), body: z.string().max(200_000) });

function toInput(formData: FormData) {
  const parsed = schema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) throw new InvalidInputError();
  const attachmentFileIds = formData.getAll("attachmentFileId").map(Number);
  if (attachmentFileIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new InvalidInputError();
  return { title: parsed.data.title, body: parsed.data.body, attachmentFileIds };
}

export async function saveResourceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/resources");
  let savedId: number | null = null;
  const result = await runAction(async () => {
    const rawId = formData.get("resourceId");
    if (rawId) {
      savedId = Number(rawId);
      if (!Number.isSafeInteger(savedId) || savedId <= 0) throw new InvalidInputError();
      await resourceService().update(principal.memberId, savedId, toInput(formData));
    } else {
      savedId = await resourceService().create(principal.memberId, toInput(formData));
    }
  });
  if (result.ok && savedId !== null) {
    revalidatePath("/resources", "layout");
    redirect(`/resources/${savedId}`);
  }
  return result;
}

async function command(formData: FormData, run: (memberId: number, id: number) => Promise<string | void>, okMessage: string) {
  const principal = await requirePrincipal("/resources");
  const result = await runAction(async () => {
    const id = Number(formData.get("resourceId"));
    if (!Number.isSafeInteger(id) || id <= 0) throw new InvalidInputError();
    return (await run(principal.memberId, id)) ?? okMessage;
  });
  if (result.ok) revalidatePath("/resources", "layout");
  return result;
}

export async function deleteResourceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await command(formData, (m, id) => resourceService().delete(m, id), "삭제했습니다.");
  if (result.ok) redirect("/resources");
  return result;
}

export const revokeResourceShareAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, id) => resourceService().revokeShare(m, id), "공유 링크를 중단했습니다.");

export async function issueResourceShareAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return command(
    formData,
    async (memberId, id) => `/share/resources/${await resourceService().issueShare(memberId, id)}`,
    "",
  );
}

/** 작성 중 본문 미리보기. 저장 전이라 첨부 이미지는 해석하지 않고, 정화된 HTML만 돌려준다. */
export async function previewResourceMarkdownAction(markdown: string): Promise<{ ok: boolean; html: string; message: string | null }> {
  await requirePrincipal("/resources");
  try {
    return { ok: true, html: renderMarkdown(String(markdown).slice(0, 200_000), { allowExternalImages: false }).value, message: null };
  } catch {
    return { ok: false, html: "", message: "미리보기를 만들 수 없습니다." };
  }
}
