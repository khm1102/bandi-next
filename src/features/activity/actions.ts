"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action-result";
import { requirePrincipal } from "@/lib/session";
import { parseKst } from "@/lib/kst";
import { InvalidInputError } from "@/features/member/errors";
import { activityService, reportService } from "./instance";
import { InvalidReportDocumentError } from "./hwpx";

const id = z.coerce.number().int().positive();

const recordSchema = z.object({
  teamId: z.coerce.number().int().positive().optional(),
  activityAt: z.string(),
  title: z.string().max(300),
  body: z.string().max(100_000),
  participantCount: z.coerce.number().int().min(1).max(10_000),
});

function toFields(formData: FormData, fallbackTeamId: number) {
  const parsed = recordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new InvalidInputError();
  const activityAt = parseKst(parsed.data.activityAt);
  return { teamId: parsed.data.teamId ?? fallbackTeamId, activityAt, title: parsed.data.title, body: parsed.data.body, participantCount: parsed.data.participantCount };
}

/** 간단 활동 기록 저장(작성/수정) + 사진 연결. */
export async function saveActivityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/activity");
  let savedId: number | null = null;
  const result = await runAction(async () => {
    const fields = toFields(formData, principal.teamId);
    const photoIds = formData.getAll("photoFileId").map(Number);
    if (photoIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) throw new InvalidInputError();
    const rawId = formData.get("recordId");
    const service = activityService();
    if (rawId) {
      savedId = id.parse(rawId);
      await service.update(principal.memberId, savedId, { activityAt: fields.activityAt, title: fields.title, body: fields.body, participantCount: fields.participantCount });
    } else {
      savedId = await service.createDraft(principal.memberId, fields);
    }
    if (rawId) {
      // 화면에서 제거한 사진은 서버에서도 제거한다 (HWPX 문서는 제외).
      const current = await service.lookupManageable(principal.memberId, savedId);
      for (const file of current.files.filter((f) => f.role !== "DOCUMENT" && !photoIds.includes(f.fileId))) {
        await service.removeFile(principal.memberId, savedId, file.fileId);
      }
    }
    for (const fileId of photoIds) {
      await service.addFile(principal.memberId, savedId, fileId, "EVIDENCE").catch((error: unknown) => {
        // 이미 연결된 사진을 다시 제출한 경우는 무시한다.
        if (!(error instanceof Error) || (error as { code?: string }).code !== "INVALID_ACTIVITY") throw error;
      });
    }
  });
  if (result.ok && savedId !== null) {
    revalidatePath("/activity", "layout");
    redirect(`/activity/${savedId}`);
  }
  return result;
}

async function command(formData: FormData, run: (memberId: number, recordId: number) => Promise<string | void>, ok: string, redirectTo?: (recordId: number) => string) {
  const principal = await requirePrincipal("/activity");
  let recordId = 0;
  const result = await runAction(async () => {
    recordId = id.parse(formData.get("recordId"));
    return (await run(principal.memberId, recordId)) ?? ok;
  });
  if (result.ok) {
    revalidatePath("/activity", "layout");
    if (redirectTo) redirect(redirectTo(recordId));
  }
  return result;
}

export const submitActivityAction = async (_p: ActionState, f: FormData) =>
  command(f, async (m, r) => void (await activityService().submit(m, r, String(f.get("changeReason") ?? "") || null)), "제출했습니다.");
export const teamApproveAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, r) => activityService().teamApprove(m, r), "1차 승인했습니다.");
export const finalApproveAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, r) => activityService().finalApprove(m, r, String(f.get("emergencyReason") ?? "") || null), "최종 승인했습니다.");
export const requestRevisionAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, r) => activityService().requestRevision(m, r, String(f.get("comment") ?? "")), "보완을 요청했습니다.");
export const archiveActivityAction = async (_p: ActionState, f: FormData) =>
  command(f, (m, r) => activityService().archive(m, r), "보관했습니다.");

// ---- HWPX 활동 내역서 ----
const participantSchema = z.object({
  name: z.string().max(40),
  department: z.string().max(60).optional(),
  studentNo: z.string().max(40).optional(),
  note: z.string().max(80).optional(),
});

function readParticipants(formData: FormData) {
  const names = formData.getAll("pName").map(String);
  const rows = names.map((name, i) => ({
    name,
    department: String(formData.getAll("pDepartment")[i] ?? ""),
    studentNo: String(formData.getAll("pStudentNo")[i] ?? ""),
    note: String(formData.getAll("pNote")[i] ?? ""),
  }));
  return rows.filter((row) => row.name.trim() !== "").map((row) => {
    const parsed = participantSchema.safeParse(row);
    if (!parsed.success) throw new InvalidReportDocumentError("participant");
    return { name: parsed.data.name, department: parsed.data.department ?? null, studentNo: parsed.data.studentNo ?? null, note: parsed.data.note ?? null };
  });
}

export async function saveReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const principal = await requirePrincipal("/activity-documents");
  let recordId: number | null = null;
  const result = await runAction(async () => {
    const activityAt = parseKst(String(formData.get("activityAt") ?? ""));
    const input = {
      recordTitle: String(formData.get("recordTitle") ?? ""),
      representative: String(formData.get("representative") ?? ""),
      location: String(formData.get("location") ?? ""),
      activityAt,
      content: String(formData.get("content") ?? ""),
      participants: readParticipants(formData),
    };
    const photo = formData.get("photo");
    const photoBytes = photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : null;
    const rawId = formData.get("recordId");
    if (rawId) {
      recordId = id.parse(rawId);
      await reportService().updateDraft(principal.memberId, recordId, input, photoBytes);
    } else {
      if (!photoBytes) throw new InvalidReportDocumentError("photo");
      recordId = (await reportService().saveDraft(principal.memberId, input, photoBytes)).activityRecordId;
    }
  });
  if (result.ok && recordId !== null) {
    revalidatePath("/activity", "layout");
    redirect(`/activity-documents?draft=${recordId}&saved=1`);
  }
  return result;
}

export async function submitReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return command(formData, async (m, r) => void (await reportService().submit(m, r)), "검수를 요청했습니다.", (r) => `/activity/${r}`);
}
