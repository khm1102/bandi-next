import { InvalidInputError } from "@/features/member/errors";
import { activityService } from "@/features/activity/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** 내 기록(작성자) 또는 팀 관리자가 보는 파일. 이미지는 화면 미리보기용 인라인을 허용한다. */
export const GET = apiRoute<Ctx>(async (request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null) throw new InvalidInputError();
  const { file, object } = await activityService().openManageableFile(principal.memberId, id, fileId);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return fileResponse(object, file, inline ? "inline" : "attachment");
});
