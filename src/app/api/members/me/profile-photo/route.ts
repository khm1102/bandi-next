import { fileService } from "@/features/file/instance";
import { readSingleFile } from "@/lib/multipart";
import { db } from "@/lib/db";
import { createProfilePhotoService } from "@/features/member/profile-photo";
import { apiRoute } from "@/lib/http";
import { logger } from "@/lib/logger";

export const PUT = apiRoute(async (request, principal) => {
  const file = await readSingleFile(request, 5 * 1024 * 1024);
  const files = fileService();
  const ref = await files.upload({
    kind: "profile-image",
    domain: "member-profile",
    file: { name: file.name, size: null, stream: file.stream },
    actorId: principal.memberId,
  });
  try {
    await createProfilePhotoService({ db, files }).set(principal.memberId, ref.id);
  } catch (error) {
    // 연결에 실패하면 방금 올린 파일을 즉시 파기 대기열로 보낸다.
    await db.transaction((tx) => files.enqueueRetirement(tx, ref.id, "PROFILE_PHOTO")).catch(() => undefined);
    throw error;
  }
  await files.runRetirements().catch((error: unknown) => logger.warn("파기 대기열 실행 실패", { error: String(error) }));
  return new Response(null, { status: 204 });
});

export const DELETE = apiRoute(async (_request, principal) => {
  const files = fileService();
  await createProfilePhotoService({ db, files }).remove(principal.memberId);
  await files.runRetirements().catch((error: unknown) => logger.warn("파기 대기열 실행 실패", { error: String(error) }));
  return new Response(null, { status: 204 });
});
