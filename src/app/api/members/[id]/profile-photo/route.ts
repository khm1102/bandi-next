import { fileService } from "@/features/file/instance";
import { db } from "@/lib/db";
import { createProfilePhotoService } from "@/features/member/profile-photo";
import { InvalidInputError } from "@/features/member/errors";
import { StoredFileNotFoundError } from "@/features/file/errors";
import { apiRoute, fileResponse, positiveId } from "@/lib/http";

/** 프로필 사진은 로그인한 활성 멤버에게만 보인다. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(async (_request, principal, context) => {
  const id = positiveId((await context.params).id);
  if (id === null) {
    throw new InvalidInputError();
  }
  if (!principal.access.canReadInternal()) {
    return Response.json({ code: "FORBIDDEN", message: "권한이 없습니다." }, { status: 403 });
  }
  const files = fileService();
  const fileId = await createProfilePhotoService({ db, files }).currentPhotoFileId(id);
  if (fileId === null) {
    throw new StoredFileNotFoundError();
  }
  const { file, object } = await files.openProfileImage(fileId);
  return fileResponse(object, file, "inline");
});
