import { InvalidInputError } from "@/features/member/errors";
import { noticeService } from "@/features/notice/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

/** 작성 중(아직 공지에 연결 전)인 본인의 임시 본문 이미지 미리보기. */
export const GET = apiRoute<{ params: Promise<{ fileId: string }> }>(async (_request, principal, context) => {
  const fileId = positiveId((await context.params).fileId);
  if (fileId === null) throw new InvalidInputError();
  const { file, object } = await noticeService().assertTemporaryImageOwned(principal.memberId, fileId);
  return fileResponse(object, file, "inline");
});
