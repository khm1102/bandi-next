import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/types";
import { logger } from "@/lib/logger";
import { fileRetirementQueue, storedFile } from "./schema";
import type { RetirementReason, StorageScope } from "./codes";
import { FileAccessDeniedError, StoredFileNotFoundError } from "./errors";
import { inspectUpload, saveToTemp, type InspectionKind } from "./inspector";
import {
  assertUploadedBy,
  generateStorageKey,
  toRef,
  validateGeneralPurpose,
  validatePrivateDownload,
  validateProfileImage,
  validatePublicUse,
  type FileRef,
  type StoredFileRow,
} from "./model";
import type { LocalFileStorage, StoredObject } from "./storage";

export interface FileServiceDeps {
  db: Db;
  storage: LocalFileStorage;
  maxUploadBytes: number;
  now?: () => Date;
}

export interface UploadInput {
  kind: InspectionKind;
  /** 저장 키 접두 (예: "resource", "activity", "notice", "member-profile") */
  domain: string;
  file: { name: string; size: number | null; stream: ReadableStream<Uint8Array> };
  actorId: number;
}

const MAX_RETIREMENT_ATTEMPTS = 10;

export function createFileService(deps: FileServiceDeps) {
  const { db, storage } = deps;
  const now = deps.now ?? (() => new Date());

  async function load(executor: DbOrTx, id: number): Promise<StoredFileRow> {
    const [row] = await executor.select().from(storedFile).where(eq(storedFile.id, id));
    if (!row) {
      throw new StoredFileNotFoundError();
    }
    return row;
  }

  async function open(row: StoredFileRow, scope: StorageScope): Promise<{ file: FileRef; object: StoredObject }> {
    return { file: toRef(row), object: await storage.open(scope, row.storageKey) };
  }

  return {
    /** 업로드: 임시 저장 → 검사 → PENDING 메타 → 원자적 이동 → READY. 실패 시 보상한다. */
    async upload(input: UploadInput): Promise<FileRef> {
      const purpose = input.kind === "profile-image" ? "PROFILE_IMAGE" : "GENERAL";
      const temp = await saveToTemp(storage, input.file.stream, deps.maxUploadBytes);
      let storageKey: string | null = null;
      let createdId: number | null = null;
      try {
        const inspection = await inspectUpload(input.file.name, input.file.size, temp, {
          kind: input.kind,
          maxUploadBytes: deps.maxUploadBytes,
        });
        storageKey = generateStorageKey(input.domain, now());
        const [created] = await db
          .insert(storedFile)
          .values({
            originalName: input.file.name,
            storageScope: "PRIVATE",
            storageKey,
            contentType: inspection.contentType,
            sizeBytes: inspection.sizeBytes,
            sha256: inspection.sha256,
            uploadStatus: "PENDING",
            purpose,
            uploadedByMemberId: input.actorId,
          })
          .returning();
        createdId = created.id;
        await storage.commit(temp.path, "PRIVATE", storageKey);
        const [ready] = await db
          .update(storedFile)
          .set({ uploadStatus: "READY" })
          .where(eq(storedFile.id, created.id))
          .returning();
        return toRef(ready);
      } catch (error) {
        await storage.removeTemp(temp.path);
        if (storageKey && createdId !== null) {
          await storage.remove("PRIVATE", storageKey).catch(() => undefined);
          await db.update(storedFile).set({ uploadStatus: "FAILED" }).where(eq(storedFile.id, createdId)).catch(() => undefined);
        }
        throw error;
      }
    },

    /** 일반 첨부로 쓸 수 있는 private READY 파일 조회 (참조 검증용). */
    async lookupPrivateReady(id: number, executor: DbOrTx = db): Promise<FileRef> {
      const row = await load(executor, id);
      validatePrivateDownload(row);
      validateGeneralPurpose(row);
      return toRef(row);
    },

    /** 호출자가 업로더 본인인 private 파일만 다른 도메인에 연결할 수 있다. */
    async assertPrivateReadyOwnedBy(id: number, memberId: number, executor: DbOrTx = db): Promise<FileRef> {
      const row = await load(executor, id);
      validatePrivateDownload(row);
      validateGeneralPurpose(row);
      assertUploadedBy(row, memberId);
      return toRef(row);
    },

    async assertProfileImageOwnedBy(id: number, memberId: number, executor: DbOrTx = db): Promise<FileRef> {
      const row = await load(executor, id);
      validatePrivateDownload(row);
      validateProfileImage(row);
      assertUploadedBy(row, memberId);
      return toRef(row);
    },

    /** 권한 판단은 호출 도메인이 끝낸 뒤 granted로 넘긴다. */
    async openPrivate(id: number, granted: boolean) {
      if (!granted) {
        throw new FileAccessDeniedError();
      }
      const row = await load(db, id);
      validatePrivateDownload(row);
      validateGeneralPurpose(row);
      return open(row, "PRIVATE");
    },

    async openProfileImage(id: number) {
      const row = await load(db, id);
      validatePrivateDownload(row);
      validateProfileImage(row);
      return open(row, "PRIVATE");
    },

    async openPublic(id: number) {
      const row = await load(db, id);
      validatePublicUse(row);
      return open(row, "PUBLIC");
    },

    /** 본인이 올린 private 파일을 공개 저장소로 복사해 새 public 파일로 등록한다. */
    async promoteToPublic(actorId: number, privateFileId: number, domain: string): Promise<number> {
      const source = await load(db, privateFileId);
      validatePrivateDownload(source);
      validateGeneralPurpose(source);
      assertUploadedBy(source, actorId);
      const publicKey = generateStorageKey(domain, now());
      const [created] = await db
        .insert(storedFile)
        .values({
          originalName: source.originalName,
          storageScope: "PUBLIC",
          storageKey: publicKey,
          contentType: source.contentType,
          sizeBytes: source.sizeBytes,
          sha256: source.sha256,
          uploadStatus: "PENDING",
          purpose: "GENERAL",
          uploadedByMemberId: actorId,
        })
        .returning();
      try {
        await storage.copy("PRIVATE", source.storageKey, "PUBLIC", publicKey);
        await db.update(storedFile).set({ uploadStatus: "READY" }).where(eq(storedFile.id, created.id));
        return created.id;
      } catch (error) {
        await storage.remove("PUBLIC", publicKey).catch(() => undefined);
        await db.update(storedFile).set({ uploadStatus: "FAILED" }).where(eq(storedFile.id, created.id));
        throw error;
      }
    },

    /** 더는 쓰지 않는 파일을 재시도 가능한 파기 대기열에 올린다 (호출부 트랜잭션에 포함). */
    async enqueueRetirement(executor: DbOrTx, fileId: number, reason: RetirementReason): Promise<void> {
      const row = await load(executor, fileId);
      await executor
        .insert(fileRetirementQueue)
        .values({ storedFileId: row.id, reason, storageScope: row.storageScope, storageKey: row.storageKey })
        .onConflictDoNothing();
    },

    /**
     * 대기열의 파일 객체와 메타데이터를 파기한다. 객체 삭제와 메타 하드 삭제가 모두 끝나야 DELETED.
     * 실패는 FAILED로 남겨 다음 실행에서 재시도한다.
     */
    async runRetirements(limit = 50): Promise<{ deleted: number; failed: number }> {
      const items = await db
        .select()
        .from(fileRetirementQueue)
        .where(
          and(
            inArray(fileRetirementQueue.status, ["PENDING", "FAILED"]),
            lt(fileRetirementQueue.attemptCount, MAX_RETIREMENT_ATTEMPTS),
          ),
        )
        .orderBy(asc(fileRetirementQueue.createdAt))
        .limit(limit);
      let deleted = 0;
      let failed = 0;
      for (const item of items) {
        try {
          await storage.remove(item.storageScope as StorageScope, item.storageKey);
          await db.transaction(async (tx) => {
            await tx.delete(storedFile).where(eq(storedFile.id, item.storedFileId));
            await tx
              .update(fileRetirementQueue)
              .set({ status: "DELETED", completedAt: now(), failureReason: null })
              .where(eq(fileRetirementQueue.id, item.id));
          });
          deleted += 1;
        } catch (error) {
          failed += 1;
          logger.warn("파일 파기 실패", { queueId: item.id, error: error instanceof Error ? error.name : "unknown" });
          await db
            .update(fileRetirementQueue)
            .set({ status: "FAILED", attemptCount: item.attemptCount + 1, failureReason: "retirement-failed" })
            .where(eq(fileRetirementQueue.id, item.id));
        }
      }
      return { deleted, failed };
    },
  };
}
