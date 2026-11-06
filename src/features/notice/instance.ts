import "server-only";
import { db } from "@/lib/db";
import { fileService } from "@/features/file/instance";
import { createNoticeService } from "./service";

export function noticeService() {
  return createNoticeService({ db, files: fileService() });
}
