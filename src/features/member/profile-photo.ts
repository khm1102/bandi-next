import { eq } from "drizzle-orm";
import type { Db } from "@/db/types";
import type { createFileService } from "@/features/file/service";
import { member } from "./schema";
import { MemberNotFoundError } from "./errors";

type FileService = ReturnType<typeof createFileService>;

/**
 * 내부 프로필 사진: 본인이 올린 PROFILE_IMAGE 파일만 연결할 수 있다.
 * 교체·삭제 시 이전 파일은 FK를 먼저 해제하고 파기 대기열에 올린다 (원본을 보관하지 않는다).
 */
export function createProfilePhotoService(deps: { db: Db; files: FileService }) {
  const { db, files } = deps;

  async function swap(memberId: number, newFileId: number | null): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
      if (!row) {
        throw new MemberNotFoundError();
      }
      if (newFileId !== null) {
        await files.assertProfileImageOwnedBy(newFileId, memberId, tx);
      }
      const previous = row.profilePhotoFileId;
      await tx.update(member).set({ profilePhotoFileId: newFileId }).where(eq(member.id, memberId));
      if (previous !== null && previous !== newFileId) {
        await files.enqueueRetirement(tx, previous, "PROFILE_PHOTO");
      }
    });
  }

  return {
    set: (memberId: number, fileId: number) => swap(memberId, fileId),
    remove: (memberId: number) => swap(memberId, null),
    async currentPhotoFileId(memberId: number): Promise<number | null> {
      const [row] = await db.select({ id: member.profilePhotoFileId }).from(member).where(eq(member.id, memberId));
      if (!row) {
        throw new MemberNotFoundError();
      }
      return row.id;
    },
  };
}
