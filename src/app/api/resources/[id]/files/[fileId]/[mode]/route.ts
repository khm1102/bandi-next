import { InvalidInputError } from "@/features/member/errors";
import { resourceService } from "@/features/resource/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string; mode: string }> };

/** 자료 열람 권한과 해당 자료의 첨부 여부를 확인한 뒤 전송한다 (download | inline). */
export const GET = apiRoute<Ctx>(async (_request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null || (params.mode !== "download" && params.mode !== "inline")) throw new InvalidInputError();
  const mode = params.mode === "inline" ? "inline" : "attachment";
  const { file, object } = await resourceService().openFile(principal.memberId, id, fileId);
  return fileResponse(object, file, mode);
});
