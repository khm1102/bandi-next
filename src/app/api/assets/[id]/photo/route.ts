import { InvalidInputError } from "@/features/member/errors";
import { assetService } from "@/features/asset/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

/** 삭제되지 않은 품목의 사진만, 로그인한 활성 멤버에게 전송한다. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(async (_request, principal, context) => {
  const id = positiveId((await context.params).id);
  if (id === null) throw new InvalidInputError();
  const { file, object } = await assetService().openPhoto(principal.memberId, id);
  return fileResponse(object, file, "inline");
});
