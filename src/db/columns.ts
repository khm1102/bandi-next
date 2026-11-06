import { bigint, timestamp } from "drizzle-orm/pg-core";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** PK: bigint identity (URL에 노출되는 숫자 ID 유지) */
export const pk = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

/** FK 컬럼 (NOT NULL 여부는 호출부에서 .notNull()) */
export const fkCol = (name: string) => bigint(name, { mode: "number" });

/** 모든 시각은 timestamptz(UTC 저장). 표시 시 Asia/Seoul로 변환한다. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => ts("created_at").notNull().defaultNow();
export const updatedAt = () => ts("updated_at").notNull().defaultNow();
export const deletedAt = () => ts("deleted_at");

/** CHECK 제약용: col IN ('A','B') (리터럴은 코드 상수 배열에서만 온다) */
export function inList(column: AnyColumn, values: readonly string[]): SQL {
  const literals = values.map((value) => sql.raw(`'${value.replace(/'/g, "''")}'`));
  return sql`${column} in (${sql.join(literals, sql`, `)})`;
}

/**
 * 한글 이름순 정렬. DB 기본 콜레이션(en_US.utf8 등)은 한글을 가나다순으로 정렬하지 않으므로
 * 코드포인트 순서인 "C"를 명시한다 (한글 음절 블록은 자모 순서와 같은 순서로 배치되어 있다).
 */
export const koSort = (column: AnyColumn): SQL => sql`${column} collate "C"`;
