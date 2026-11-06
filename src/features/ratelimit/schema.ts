import { index, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { ts } from "@/db/columns";

/** 인스턴스 간에 공유되는 고정 창 속도 제한 카운터. 만료된 행은 주기적으로 정리한다. */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: varchar("key", { length: 200 }).primaryKey(),
    count: integer("count").notNull(),
    resetAt: ts("reset_at").notNull(),
  },
  (t) => [index("idx_rate_limit_reset").on(t.resetAt)],
);
