import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // 서버 전용 가드는 Node 단위 테스트에서 no-op으로 대체한다.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 통합 테스트가 하나의 Postgres 스키마를 공유하므로 파일 단위로 순차 실행한다.
    fileParallelism: false,
  },
});
