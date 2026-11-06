/**
 * 단일 프로세스 고정 창 속도 제한. 다중 인스턴스에서는 인스턴스별로 적용되는 보조 방어이며
 * (중요한 로그인 보호는 DB 기반 school_login_attempt가 담당한다), 메모리는 주기적으로 정리한다.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = now();

  function sweep(current: number) {
    if (current - lastSweep < 60_000) return;
    lastSweep = current;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  return {
    hit(key: string, options: RateLimitOptions): RateLimitResult {
      const current = now();
      sweep(current);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= current) {
        bucket = { count: 0, resetAt: current + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= options.limit;
      return {
        allowed,
        remaining: Math.max(0, options.limit - bucket.count),
        retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
      };
    },
    size: () => buckets.size,
  };
}

export const limiter = createRateLimiter();

/** 신뢰하는 프록시 뒤에서만 X-Forwarded-For의 첫 주소를 클라이언트 IP로 쓴다. */
export function clientKey(headers: Pick<Headers, "get">, trustProxy: boolean): string {
  if (!trustProxy) return "direct";
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : "unknown";
}
