import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { FileTooLargeError, InvalidFileError } from "./errors";
import type { LocalFileStorage } from "./storage";

const SIGNATURE_SIZE = 16;
const MAX_ZIP_ENTRIES = 4096;
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const NOTICE_INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "hwpx", "mp4"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export type InspectionKind = "general" | "profile-image" | "notice-image";

export interface TempUpload {
  path: string;
  sizeBytes: number;
  sha256: string;
  signature: Buffer;
}

export interface FileInspection {
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

/** 업로드 스트림을 임시 파일로 저장하면서 해시·시그니처를 계산한다. 한도를 넘으면 중단한다. */
export async function saveToTemp(
  storage: LocalFileStorage,
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<TempUpload> {
  const tempPath = await storage.newTempPath();
  const hash = createHash("sha256");
  const signature = Buffer.alloc(SIGNATURE_SIZE);
  let signatureLength = 0;
  let total = 0;
  const writer = storage.createTempWriter(tempPath);
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new FileTooLargeError());
        return;
      }
      hash.update(chunk);
      if (signatureLength < SIGNATURE_SIZE) {
        const copied = chunk.copy(signature, signatureLength, 0, SIGNATURE_SIZE - signatureLength);
        signatureLength += copied;
      }
      writer.write(chunk, callback);
    },
    final(callback) {
      writer.end(callback);
    },
  });
  try {
    await pipeline(source as unknown as NodeJS.ReadableStream, sink);
  } catch (error) {
    writer.destroy();
    await storage.removeTemp(tempPath);
    if (error instanceof FileTooLargeError) {
      throw error;
    }
    throw new InvalidFileError("unreadable-content");
  }
  if (total === 0) {
    await storage.removeTemp(tempPath);
    throw new InvalidFileError("empty-file");
  }
  return { path: tempPath, sizeBytes: total, sha256: hash.digest("hex"), signature: signature.subarray(0, signatureLength) };
}

function extensionOf(originalName: string): string {
  if (
    !originalName ||
    originalName.trim() === "" ||
    originalName.length > 255 ||
    originalName.includes("/") ||
    originalName.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(originalName)
  ) {
    throw new InvalidFileError("invalid-name");
  }
  const dot = originalName.lastIndexOf(".");
  if (dot <= 0 || dot === originalName.length - 1) {
    throw new InvalidFileError("missing-extension");
  }
  const extension = originalName.substring(dot + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new InvalidFileError("unsupported-extension");
  }
  return extension;
}

const startsWith = (signature: Buffer, expected: number[]) =>
  signature.length >= expected.length && expected.every((byte, index) => signature[index] === byte);

const asciiAt = (signature: Buffer, offset: number, text: string) =>
  signature.length >= offset + text.length && signature.subarray(offset, offset + text.length).toString("latin1") === text;

function listZip(filePath: string, onEntry: (name: string, read: () => Promise<Buffer>) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError || !zip) {
        reject(new InvalidFileError("invalid-office-file"));
        return;
      }
      let count = 0;
      zip.on("entry", (entry: yauzl.Entry) => {
        count += 1;
        if (count > MAX_ZIP_ENTRIES) {
          zip.close();
          reject(new InvalidFileError("too-many-office-entries"));
          return;
        }
        onEntry(entry.fileName, () =>
          new Promise<Buffer>((res, rej) => {
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                rej(streamError ?? new Error("no stream"));
                return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              stream.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > 4096) {
                  stream.destroy(new Error("too large"));
                  return;
                }
                chunks.push(chunk);
              });
              stream.on("end", () => res(Buffer.concat(chunks)));
              stream.on("error", rej);
            });
          }),
        );
        zip.readEntry();
      });
      zip.on("end", () => resolve());
      zip.on("error", () => reject(new InvalidFileError("invalid-office-file")));
      zip.readEntry();
    });
  });
}

async function requireOffice(filePath: string, word: boolean): Promise<string> {
  let contentTypes = false;
  let directory = false;
  await listZip(filePath, (name) => {
    contentTypes ||= name === "[Content_Types].xml";
    directory ||= name.startsWith(word ? "word/" : "xl/");
  });
  if (!contentTypes || !directory) {
    throw new InvalidFileError("invalid-office-file");
  }
  return word
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

async function requireHwpx(filePath: string): Promise<string> {
  let validMimetype = false;
  let manifest = false;
  let section = false;
  const pending: Promise<void>[] = [];
  await listZip(filePath, (name, read) => {
    if (name === "mimetype") {
      pending.push(
        read().then((buffer) => {
          validMimetype = buffer.toString("ascii").trim() === "application/hwp+zip";
        }),
      );
    }
    manifest ||= name === "Contents/content.hpf";
    section ||= name.startsWith("Contents/section") && name.endsWith(".xml");
  });
  await Promise.all(pending).catch(() => {
    throw new InvalidFileError("invalid-hwpx-file");
  });
  if (!validMimetype || !manifest || !section) {
    throw new InvalidFileError("invalid-hwpx-file");
  }
  return "application/hwp+zip";
}

async function detectContentType(extension: string, upload: TempUpload): Promise<string> {
  const sig = upload.signature;
  const mismatch = () => new InvalidFileError("signature-mismatch");
  switch (extension) {
    case "jpg":
    case "jpeg":
      if (!startsWith(sig, [0xff, 0xd8, 0xff])) throw mismatch();
      return "image/jpeg";
    case "png":
      if (!startsWith(sig, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw mismatch();
      return "image/png";
    case "webp":
      if (!asciiAt(sig, 0, "RIFF") || !asciiAt(sig, 8, "WEBP")) throw mismatch();
      return "image/webp";
    case "pdf":
      if (!startsWith(sig, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw mismatch();
      return "application/pdf";
    case "mp4":
      if (!asciiAt(sig, 4, "ftyp")) throw mismatch();
      return "video/mp4";
    case "docx":
      return requireOffice(upload.path, true);
    case "xlsx":
      return requireOffice(upload.path, false);
    case "hwpx":
      return requireHwpx(upload.path);
    default:
      throw new InvalidFileError("unsupported-extension");
  }
}

/** 이름·크기·시그니처·ZIP 구조를 검사해 서버가 판정한 콘텐츠 타입을 반환한다. 클라이언트 MIME은 신뢰하지 않는다. */
export async function inspectUpload(
  originalName: string,
  declaredSize: number | null,
  upload: TempUpload,
  options: { kind: InspectionKind; maxUploadBytes: number },
): Promise<FileInspection> {
  const extension = extensionOf(originalName);
  const limit =
    options.kind === "profile-image"
      ? PROFILE_IMAGE_MAX_BYTES
      : options.kind === "notice-image"
        ? NOTICE_INLINE_IMAGE_MAX_BYTES
        : options.maxUploadBytes;
  if (options.kind !== "general" && !IMAGE_EXTENSIONS.has(extension)) {
    throw new InvalidFileError(options.kind === "profile-image" ? "unsupported-profile-image-extension" : "unsupported-notice-image-extension");
  }
  // 스트리밍 업로드는 선언 크기를 알 수 없으므로 실제로 받은 크기를 기준으로 삼는다.
  declaredSize ??= upload.sizeBytes;
  if (declaredSize <= 0) {
    throw new InvalidFileError("empty-file");
  }
  if (declaredSize > limit || upload.sizeBytes > limit) {
    throw new FileTooLargeError();
  }
  const actual = (await stat(upload.path)).size;
  if (actual !== declaredSize || upload.sizeBytes !== declaredSize) {
    throw new InvalidFileError("declared-size-mismatch");
  }
  const contentType = await detectContentType(extension, upload);
  if (options.kind !== "general" && !contentType.startsWith("image/")) {
    throw new InvalidFileError("invalid-image");
  }
  return { contentType, sizeBytes: upload.sizeBytes, sha256: upload.sha256 };
}
