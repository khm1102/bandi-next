import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createFileService } from "./service";
import { LocalFileStorage } from "./storage";

export function fileService() {
  const e = env();
  return createFileService({
    db,
    storage: new LocalFileStorage(e.FILE_STORAGE_ROOT),
    maxUploadBytes: e.FILE_STORAGE_MAX_UPLOAD_BYTES,
  });
}
