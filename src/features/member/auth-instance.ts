import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createAuthService } from "./auth-service";
import { createTukoreaSsoClient, type SchoolSsoClient } from "./sso/client";
import { createFakeSsoClient } from "./sso/fake";
import { createFetchSsoSession, originOf } from "./sso/http-session";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function ssoClient(): SchoolSsoClient {
  const e = env();
  if (e.SCHOOL_SSO_MODE === "fake") {
    return createFakeSsoClient();
  }
  const config = { loginPageUrl: e.SCHOOL_SSO_LOGIN_PAGE_URL, loginProcessUrl: e.SCHOOL_SSO_LOGIN_PROCESS_URL };
  const allowedOrigins = [
    originOf(new URL(config.loginPageUrl)),
    originOf(new URL(config.loginProcessUrl)),
    originOf(new URL("https://portal.tukorea.ac.kr")),
  ];
  return createTukoreaSsoClient(config, () =>
    createFetchSsoSession({ allowedOrigins, userAgent: USER_AGENT, requestTimeoutMs: e.SCHOOL_SSO_REQUEST_TIMEOUT_MS }),
  );
}

export function authService() {
  const e = env();
  return createAuthService({
    db,
    sso: ssoClient(),
    hashSecret: e.LOGIN_ATTEMPT_HASH_SECRET,
    limits: {
      maxFailures: e.SCHOOL_LOGIN_MAX_FAILURES,
      failureWindowMs: e.SCHOOL_LOGIN_FAILURE_WINDOW_MINUTES * 60_000,
      cooldownMs: e.SCHOOL_LOGIN_COOLDOWN_MINUTES * 60_000,
    },
  });
}
