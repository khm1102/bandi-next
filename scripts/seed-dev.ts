/**
 * 로컬·E2E 전용 시드: 가짜 SSO 계정(src/features/member/sso/fake.ts)과 짝이 되는 멤버를 만든다.
 * 운영 DB에는 절대 실행하지 않는다.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cohort, member } from "../src/features/member/schema";
import { hashPassword } from "../src/features/member/password";

if (process.env.NODE_ENV === "production") {
  throw new Error("seed-dev는 운영 환경에서 실행할 수 없습니다.");
}

const url = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL이 필요합니다.");
}

const ACCOUNTS = [
  { studentNo: "9000000001", name: "MemberA", role: "MEMBER", teamId: 3 },
  { studentNo: "9000000002", name: "MemberB", role: "MEMBER", teamId: 4 },
  { studentNo: "9000000003", name: "LeaderA", role: "LEADER", teamId: 3 },
  { studentNo: "9000000004", name: "LeaderB", role: "LEADER", teamId: 4 },
  { studentNo: "9000000005", name: "AdminX", role: "ADMIN", teamId: 3 },
] as const;

async function main() {
  // 로컬·E2E 전용 가짜 계정의 반디 비밀번호는 모두 "pw"이다 (정책 검사를 거치지 않는 시드 값).
  const passwordHash = await hashPassword("pw");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await db.insert(cohort).values({ name: "1-1" }).onConflictDoNothing();
  const [c] = await db.select().from(cohort).where(eq(cohort.name, "1-1"));
  for (const account of ACCOUNTS) {
    await db
      .insert(member)
      .values({
        ...account,
        department: "Test",
        cohortId: c.id,
        status: "ACTIVE",
        ssoLinkStatus: "LINKED",
        passwordHash,
        passwordSetAt: new Date(),
      })
      .onConflictDoNothing();
  }
  console.log(`시드 완료: ${ACCOUNTS.length}명`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
