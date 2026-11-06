import { z } from "zod";
import { fileService } from "@/features/file/instance";
import { MemberManagementForbiddenError, InvalidInputError } from "@/features/member/errors";
import { apiRoute, positiveId } from "@/lib/http";

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (request, principal, context) => {
  if (!principal.access.canManageGlobal()) {
    throw new MemberManagementForbiddenError();
  }
  const id = positiveId((await context.params).id);
  const body = z.object({ domain: z.string().regex(/^[a-z][a-z0-9-]{1,29}$/) }).safeParse(await request.json().catch(() => null));
  if (id === null || !body.success) {
    throw new InvalidInputError();
  }
  const publicId = await fileService().promoteToPublic(principal.memberId, id, body.data.domain);
  return Response.json({ id: publicId }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
