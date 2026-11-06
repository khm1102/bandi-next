import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  FILE_STORAGE_ROOT: z.string().min(1),
  FILE_STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
  LOGIN_ATTEMPT_HASH_SECRET: z.string().min(16),
  SCHOOL_LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  SCHOOL_LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  SCHOOL_LOGIN_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(15),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  /** 신뢰하는 리버스 프록시 뒤에서만 true (X-Forwarded-For를 클라이언트 IP로 사용). */
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** fake는 로컬·E2E 전용 가짜 SSO. 운영에서는 거부한다. */
  SCHOOL_SSO_MODE: z.enum(["real", "fake"]).default("real"),
  SCHOOL_SSO_LOGIN_PAGE_URL: z.string().url().default("https://ksc.tukorea.ac.kr/sso/login_stand.jsp"),
  SCHOOL_SSO_LOGIN_PROCESS_URL: z
    .string()
    .url()
    .default("https://ksc.tukorea.ac.kr/sso/login_proc.jsp?returnurl=null"),
  SCHOOL_SSO_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SCHOOL_SSO_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    // 값 자체는 로그에 남기지 않고 필드명만 보고한다.
    throw new Error(`환경변수 검증 실패: ${fields}`);
  }
  if (
    result.data.NODE_ENV === "production" &&
    result.data.LOGIN_ATTEMPT_HASH_SECRET === "local-development-only-secret"
  ) {
    throw new Error("환경변수 검증 실패: LOGIN_ATTEMPT_HASH_SECRET (운영에서 개발 기본값 사용 불가)");
  }
  if (result.data.NODE_ENV === "production" && result.data.SCHOOL_SSO_MODE === "fake") {
    throw new Error("환경변수 검증 실패: SCHOOL_SSO_MODE (운영에서 fake 불가)");
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
