import "server-only";
import { db } from "@/lib/db";
import { fileService } from "@/features/file/instance";
import { createAssetService } from "./service";

export function assetService() {
  return createAssetService({ db, files: fileService() });
}
