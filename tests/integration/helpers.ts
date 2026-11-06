import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi_test";

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

/** 테스트 DB에 마이그레이션을 적용하고 연결을 반환한다. */
export async function testDb(): Promise<NodePgDatabase> {
  if (!db) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
    db = drizzle(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
  }
  return db;
}

export async function closeTestDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}

/** team 시드를 제외한 모든 테이블 비우기 */
export async function resetData(database: NodePgDatabase): Promise<void> {
  const rows = await database.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'
        and tablename not in ('team', '__drizzle_migrations')`,
  );
  const names = rows.rows.map((row) => `"${row.tablename}"`).join(", ");
  await database.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}

/** 제약 위반이 어떤 이름의 제약인지 확인하기 위해 PG 에러 코드/제약명을 뽑는다. */
export async function violation(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
    const pg = cause as { code?: string; constraint?: string };
    return { code: pg.code, constraint: pg.constraint };
  }
  return {};
}
