import "server-only";
import { db } from "@/lib/db";
import { fileService } from "@/features/file/instance";
import { logger } from "@/lib/logger";
import { purgeExpiredBuckets } from "@/lib/rate-limit-db";
import { sessionStore } from "@/lib/session";

const INTERVAL_MS = 10 * 60_000;
let lastRun = 0;
let running = false;

/**
 * 만료 데이터 정리: 속도 제한 버킷, 만료 세션, 파기 대기열(재시도).
 * 별도 스케줄러 없이 요청이 오가는 동안 인스턴스당 10분에 한 번만 백그라운드로 실행한다.
 * 실패해도 요청을 막지 않는다.
 */
export function runMaintenanceIfDue(now: number = Date.now()): void {
  if (running || now - lastRun < INTERVAL_MS) return;
  running = true;
  lastRun = now;
  void (async () => {
    try {
      await purgeExpiredBuckets(db);
      await sessionStore().purgeExpired();
      await fileService().runRetirements();
    } catch (error) {
      logger.warn("정기 정리 작업 실패", { error: error instanceof Error ? error.name : "unknown" });
    } finally {
      running = false;
    }
  })();
}
