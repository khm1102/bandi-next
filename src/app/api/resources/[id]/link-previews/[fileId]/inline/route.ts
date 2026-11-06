import { InvalidInputError } from "@/features/member/errors";
import { resourceService } from "@/features/resource/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** 링크 카드 대표 이미지: 열람자의 브라우저가 외부 서버를 직접 요청하지 않도록 우리 서버가 전송한다. */
export const GET = apiRoute<Ctx>(async (_request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null) throw new InvalidInputError();
  const { file, object } = await resourceService().openPreviewImage(principal.memberId, id, fileId);
  return fileResponse(object, file, "inline");
});
