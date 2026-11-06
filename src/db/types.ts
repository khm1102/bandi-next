import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** 서비스 내부 함수가 단독 호출·트랜잭션 양쪽에서 쓸 수 있는 실행 핸들 */
export type DbOrTx = Db | Tx;
