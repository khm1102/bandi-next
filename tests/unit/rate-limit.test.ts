import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("한도까지 허용하고 초과하면 재시도 시간을 알려준다", () => {
    const limiter = createRateLimiter(() => 0);
    const opts = { limit: 3, windowMs: 10_000 };
    expect([1, 2, 3].map(() => limiter.hit("k", opts).allowed)).toEqual([true, true, true]);
    const blocked = limiter.hit("k", opts);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSec).toBe(10);
  });

  it("창이 지나면 초기화되고 키는 서로 독립이다", () => {
    let t = 0;
    const limiter = createRateLimiter(() => t);
    const opts = { limit: 1, windowMs: 1_000 };
    expect(limiter.hit("a", opts).allowed).toBe(true);
    expect(limiter.hit("a", opts).allowed).toBe(false);
    expect(limiter.hit("b", opts).allowed).toBe(true);
    t = 1_001;
    expect(limiter.hit("a", opts).allowed).toBe(true);
  });

  it("만료된 버킷은 주기적으로 정리된다 (메모리 누수 방지)", () => {
    let t = 0;
    const limiter = createRateLimiter(() => t);
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`, { limit: 1, windowMs: 1_000 });
    expect(limiter.size()).toBe(100);
    t = 120_000;
    limiter.hit("fresh", { limit: 1, windowMs: 1_000 });
    expect(limiter.size()).toBe(1);
  });
});

describe("clientKey", () => {
  const h = (value?: string) => new Headers(value ? { "x-forwarded-for": value } : {});
  it("프록시를 신뢰하지 않으면 헤더를 무시한다 (위조 방지)", () => {
    expect(clientKey(h("1.2.3.4"), false)).toBe("direct");
  });
  it("신뢰하는 프록시에서는 첫 주소를 쓰고 잘못된 값은 unknown이다", () => {
    expect(clientKey(h("1.2.3.4, 10.0.0.1"), true)).toBe("1.2.3.4");
    expect(clientKey(h("evil<script>"), true)).toBe("unknown");
    expect(clientKey(h(), true)).toBe("unknown");
  });
});
