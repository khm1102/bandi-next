import { InvalidInputError } from "@/features/member/errors";
import { noticeService } from "@/features/notice/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string; mode: string }> };

/** 초안·예약 공지의 첨부 (관리 권한자 전용). */
export const GET = apiRoute<Ctx>(async (_request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null || (params.mode !== "download" && params.mode !== "inline")) {
    throw new InvalidInputError();
  }
  const mode = params.mode === "inline" ? "inline" : "attachment";
  const { file, object } = await noticeService().openManageableAttachment(principal.memberId, id, fileId, mode);
  return fileResponse(object, file, mode);
});
