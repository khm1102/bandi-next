import { lt, sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { rateLimitBucket } from "@/features/ratelimit/schema";
import type { RateLimitOptions, RateLimitResult } from "./rate-limit";

/**
 * DB 기반 고정 창 속도 제한 (다중 인스턴스 공유). 한 번의 원자적 upsert로 카운트를 올리고,
 * 창이 지났으면 1부터 다시 센다. 시각은 DB 시계를 기준으로 한다.
 */
export async function hitShared(db: Db, key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const windowSec = options.windowMs / 1000;
  const result = await db.execute<{ count: number; retry: number }>(sql`
    insert into rate_limit_bucket as b (key, count, reset_at)
    values (${key.slice(0, 200)}, 1, now() + make_interval(secs => ${windowSec}))
    on conflict (key) do update set
      count = case when b.reset_at <= now() then 1 else b.count + 1 end,
      reset_at = case when b.reset_at <= now() then now() + make_interval(secs => ${windowSec}) else b.reset_at end
    returning count, greatest(1, ceil(extract(epoch from (reset_at - now()))))::int as retry
  `);
  const row = result.rows[0];
  const allowed = row.count <= options.limit;
  return { allowed, remaining: Math.max(0, options.limit - row.count), retryAfterSec: allowed ? 0 : row.retry };
}

export async function purgeExpiredBuckets(db: Db): Promise<void> {
  await db.delete(rateLimitBucket).where(lt(rateLimitBucket.resetAt, sql`now()`));
}
