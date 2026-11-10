import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createAdminService } from "./service";

export function adminService() {
  return createAdminService({ db, hashSecret: env().LOGIN_ATTEMPT_HASH_SECRET });
}
