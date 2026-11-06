import { InvalidInputError } from "@/features/member/errors";
import { noticeService } from "@/features/notice/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string; mode: string }> };

/** 공지 열람 권한을 통과한 첨부만 다운로드(download) 또는 이미지 인라인(inline)으로 전송한다. */
export const GET = apiRoute<Ctx>(async (_request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null || (params.mode !== "download" && params.mode !== "inline")) {
    throw new InvalidInputError();
  }
  const mode = params.mode === "inline" ? "inline" : "attachment";
  const { file, object } = await noticeService().openAttachment(principal.memberId, id, fileId, mode);
  return fileResponse(object, file, mode);
});
