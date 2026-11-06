import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createSessionStore, type Principal } from "@/lib/session-store";
import type { Role } from "@/features/member/codes";

export const SESSION_COOKIE = "bandi_session";

export function sessionStore() {
  return store();
}

function store() {
  return createSessionStore({ db, ttlMs: env().SESSION_TTL_MINUTES * 60_000 });
}

/** 로그인 성공 후 세션을 발급하고 쿠키에 담는다 (세션 고정 방지: 항상 새 토큰). */
export async function startSession(memberId: number): Promise<void> {
  const userAgent = (await headers()).get("user-agent");
  const token = await store().issue(memberId, userAgent);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: env().SESSION_TTL_MINUTES * 60,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await store().revoke(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** 요청당 한 번만 조회한다. 항상 DB의 현재 역할·상태를 반영한다. */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return store().resolve(token);
});

/** 로그인 필수. 없으면 로그인 화면으로 보낸다. */
export async function requirePrincipal(returnTo?: string): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return principal;
}

/** 역할 필수. 로그인했지만 권한이 없으면 403 화면(forbidden)으로 처리한다. */
export async function requireRole(...roles: Role[]): Promise<Principal> {
  const principal = await requirePrincipal();
  if (!roles.includes(principal.role) || !principal.access.active) {
    forbidden();
  }
  return principal;
}
