// 운영 컨테이너에서 DB 마이그레이션을 적용한다 (devDependencies 없이 동작: drizzle-orm 마이그레이터 사용).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 필요합니다.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("마이그레이션 적용 완료");
} finally {
  await pool.end();
}
