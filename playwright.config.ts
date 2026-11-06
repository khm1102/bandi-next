import { defineConfig } from "@playwright/test";

/** 가짜 SSO(SCHOOL_SSO_MODE=fake)로 기동된 서버를 대상으로 한다. 기본 포트 3100. */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "ko-KR",
    trace: "retain-on-failure",
  },
});
