import "server-only";
import { db } from "@/lib/db";
import { fileService } from "@/features/file/instance";
import { createResourceService } from "./service";

export function resourceService() {
  return createResourceService({ db, files: fileService() });
}
