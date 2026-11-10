import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { clientKey } from "@/lib/rate-limit";
import { hitShared } from "@/lib/rate-limit-db";

/** 학번별 잠금(DB)과 별개로 IP당 요청 속도를 제한한다. true면 제한됨. */
export async function loginThrottled(scope: string): Promise<boolean> {
  const rate = await hitShared(db, `${scope}:${clientKey(await headers(), env().TRUST_PROXY)}`, { limit: env().TRUST_PROXY ? 20 : 200, windowMs: 60_000 });
  return !rate.allowed;
}

export const SETUP_COOKIE = "bandi_pw_setup";
export const SETUP_COOKIE_MAX_AGE_SECONDS = 10 * 60;
