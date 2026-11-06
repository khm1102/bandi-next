import "server-only";
import { db } from "@/lib/db";
import { fileService } from "@/features/file/instance";
import { createReportService } from "./report-service";
import { createActivityService } from "./service";

export function activityService() {
  return createActivityService({ db, files: fileService() });
}

export function reportService() {
  const files = fileService();
  return createReportService({ db, files, activities: createActivityService({ db, files }) });
}
