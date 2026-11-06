import type { storedFile } from "./schema";
import { FileAccessDeniedError, InvalidFileStateError } from "./errors";

export type StoredFileRow = typeof storedFile.$inferSelect;

export interface FileRef {
  id: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  storageScope: string;
  purpose: string;
}

export const toRef = (row: StoredFileRow): FileRef => ({
  id: row.id,
  originalName: row.originalName,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  storageScope: row.storageScope,
  purpose: row.purpose,
});

const READY = "READY";

export function validatePrivateDownload(file: StoredFileRow): void {
  if (file.deletedAt || file.storageScope !== "PRIVATE" || file.uploadStatus !== READY) {
    throw new InvalidFileStateError();
  }
}

export function validateGeneralPurpose(file: StoredFileRow): void {
  if (file.purpose !== "GENERAL") {
    throw new InvalidFileStateError();
  }
}

export function validateProfileImage(file: StoredFileRow): void {
  if (file.purpose !== "PROFILE_IMAGE" || !file.contentType.startsWith("image/")) {
    throw new InvalidFileStateError();
  }
}

export function validatePublicUse(file: StoredFileRow): void {
  if (file.deletedAt || file.storageScope !== "PUBLIC" || file.uploadStatus !== READY || file.purpose !== "GENERAL") {
    throw new InvalidFileStateError();
  }
}

export function assertUploadedBy(file: StoredFileRow, memberId: number): void {
  if (file.uploadedByMemberId !== memberId) {
    throw new FileAccessDeniedError();
  }
}

const DOMAIN_PATTERN = /^[a-z][a-z0-9-]{1,29}$/;

/** 저장 키: {domain}/{yyyy}/{mm}/{uuid}. 도메인은 코드가 정한 소문자 식별자만 허용한다. */
export function generateStorageKey(domain: string, today: Date, uuid: string = crypto.randomUUID()): string {
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error("domain must be a lowercase feature identifier");
  }
  const month = String(today.getUTCMonth() + 1).padStart(2, "0");
  return `${domain}/${today.getUTCFullYear()}/${month}/${uuid}`;
}
