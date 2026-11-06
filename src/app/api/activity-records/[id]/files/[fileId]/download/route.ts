import { InvalidInputError } from "@/features/member/errors";
import { activityService } from "@/features/activity/instance";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** 최종 승인된 기록의 파일만 모든 활성 멤버에게 전송한다. */
export const GET = apiRoute<Ctx>(async (_request, principal, context) => {
  const params = await context.params;
  const id = positiveId(params.id);
  const fileId = positiveId(params.fileId);
  if (id === null || fileId === null) throw new InvalidInputError();
  const { file, object } = await activityService().openApprovedFile(principal.memberId, id, fileId);
  return fileResponse(object, file, "attachment");
});
