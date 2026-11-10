import { jsonb, pgTable, varchar } from "drizzle-orm/pg-core";
import { fkCol, ts } from "@/db/columns";
import { member } from "@/features/member/schema";

/**
 * 운영진이 정하는 동아리 전체 설정(키-값). 값은 서버가 허용 목록으로 정규화한 JSON만 저장한다.
 * 자유 입력(HTML 등)은 받지 않는다.
 */
export const appSetting = pgTable("app_setting", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull(),
  updatedByMemberId: fkCol("updated_by_member_id").references(() => member.id),
});
