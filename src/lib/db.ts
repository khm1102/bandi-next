import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";

declare global {
  // 개발 모드 HMR에서 풀이 중복 생성되지 않도록 전역에 보관한다.
  var __bandiDb: NodePgDatabase | undefined;
}

function create(): NodePgDatabase {
  return drizzle(new Pool({ connectionString: env().DATABASE_URL, max: 10 }));
}

function get(): NodePgDatabase {
  return (globalThis.__bandiDb ??= create());
}

/**
 * 첫 사용 시점에 연결을 만든다. `next build`처럼 DB가 필요 없는 단계에서
 * 환경변수 검증이 실행되지 않도록 지연 생성한다.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, property) {
    const instance = get() as unknown as Record<string | symbol, unknown>;
    const value = instance[property];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
