"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { InvalidInputError } from "@/features/member/errors";
import { assetService } from "./instance";

const id = z.coerce.number().int().positive();

const itemSchema = z.object({
  name: z.string().max(200),
  category: z.string().max(100),
  trackingType: z.string().max(30),
  ownerType: z.enum(["CLUB", "MEMBER", "EXTERNAL"]),
  ownerStudentNo: z.string().max(20).optional(),
  externalOwnerName: z.string().max(200).optional(),
  totalQuantity: z.coerce.number().int(),
  storageLocation: z.string().max(400),
  note: z.string().max(5000).optional(),
});

async function toItem(formData: FormData) {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new InvalidInputError();
  const v = parsed.data;
  const photo = formData.get("photoFileId");
  const photoFileId = photo ? Number(photo) : null;
  if (photoFileId !== null && (!Number.isSafeInteger(photoFileId) || photoFileId <= 0)) throw new InvalidInputError();
  return {
    name: v.name,
    category: v.category,
    trackingType: v.trackingType,
    ownerType: v.ownerType,
    ownerStudentNo: v.ownerStudentNo?.trim() || null,
    externalOwnerName: v.ownerType === "EXTERNAL" ? v.externalOwnerName ?? null : null,
    totalQuantity: v.totalQuantity,
    storageLocation: v.storageLocation,
    note: v.note ?? null,
    photoFileId,
  };
}

export async function saveAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/props");
  let savedId: number | null = null;
  const result = await runAction(async () => {
    const input = await toItem(formData);
    // 개인 소유는 학번으로 소유 멤버를 찾는다.
    let ownerMemberId: number | null = null;
    if (input.ownerType === "MEMBER") {
      if (!input.ownerStudentNo) throw new InvalidInputError("소유 멤버의 학번을 입력해 주세요.");
      const owner = await assetService().findMemberIdByStudentNo(principal.memberId, input.ownerStudentNo);
      ownerMemberId = owner;
    }
    const { ownerStudentNo: _ignored, ...rest } = input;
    void _ignored;
    const fields = { ...rest, ownerMemberId };
    const rawId = formData.get("assetItemId");
    if (rawId) {
      savedId = id.parse(rawId);
      await assetService().updateItem(principal.memberId, savedId, fields);
    } else {
      savedId = await assetService().registerItem(principal.memberId, fields);
    }
  });
  if (result.ok && savedId !== null) {
    revalidatePath("/props", "layout");
    redirect(`/props/${savedId}`);
  }
  return result;
}

async function command(formData: FormData, run: (memberId: number, itemId: number) => Promise<string | void>, ok: string) {
  const principal = await requirePrincipal("/props");
  const result = await runAction(async () => {
    const itemId = id.parse(formData.get("assetItemId"));
    return (await run(principal.memberId, itemId)) ?? ok;
  });
  if (result.ok) revalidatePath("/props", "layout");
  return result;
}

export const changeAssetStatusAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, itemId) => assetService().changeItemStatus(m, itemId, String(f.get("status") ?? ""), String(f.get("note") ?? "") || null), "상태를 변경했습니다.");

export const registerUnitAction = async (_p: ActionState, f: FormData) =>
  command(f, async (m, itemId) => void (await assetService().registerUnit(m, itemId, { managementNo: String(f.get("managementNo") ?? ""), storageLocation: String(f.get("storageLocation") ?? "") })), "장비를 등록했습니다.");

export const updateUnitAction = async (_p: ActionState, f: FormData) =>
  command(f, (m) => assetService().updateUnit(m, id.parse(f.get("assetUnitId")), { status: String(f.get("status") ?? ""), storageLocation: String(f.get("storageLocation") ?? "") }, String(f.get("note") ?? "") || null), "장비를 수정했습니다.");

export async function deleteAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await command(formData, (m, itemId) => assetService().deleteItem(m, itemId), "삭제했습니다.");
  if (result.ok) redirect("/props");
  return result;
}

export const restoreAssetAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, itemId) => assetService().restoreItem(m, itemId), "복구했습니다.");
