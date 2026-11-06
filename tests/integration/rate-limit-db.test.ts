import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { hitShared, purgeExpiredBuckets } from "@/lib/rate-limit-db";
import { rateLimitBucket } from "@/features/ratelimit/schema";

let db: NodePgDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetData(db);
});

describe("DB 기반 속도 제한 (인스턴스 간 공유)", () => {
  it("한도까지 허용하고 초과하면 재시도 시간을 알려준다", async () => {
    const opts = { limit: 3, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitShared(db, "k", opts));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSec).toBeGreaterThan(0);
    expect(results[3].retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("동시에 들어온 요청도 정확히 센다 (원자적 upsert)", async () => {
    const opts = { limit: 5, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 12 }, () => hitShared(db, "race", opts)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("키는 독립이고 창이 지나면 1부터 다시 센다", async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await hitShared(db, "a", opts)).allowed).toBe(true);
    expect((await hitShared(db, "a", opts)).allowed).toBe(false);
    expect((await hitShared(db, "b", opts)).allowed).toBe(true);
    await db.execute(sql`update rate_limit_bucket set reset_at = now() - interval '1 second' where key = 'a'`);
    expect((await hitShared(db, "a", opts)).allowed).toBe(true);
  });

  it("만료된 버킷만 정리한다", async () => {
    await hitShared(db, "old", { limit: 1, windowMs: 60_000 });
    await hitShared(db, "new", { limit: 1, windowMs: 60_000 });
    await db.execute(sql`update rate_limit_bucket set reset_at = now() - interval '1 minute' where key = 'old'`);
    await purgeExpiredBuckets(db);
    const rows = await db.select().from(rateLimitBucket);
    expect(rows.map((r) => r.key)).toEqual(["new"]);
  });
});
