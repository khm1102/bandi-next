import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * 개발 서버를 같은 네트워크의 다른 기기(LAN 주소)에서 열 때도 클라이언트 스크립트가 붙도록 허용한다.
 * 개발 모드에만 적용되며, 서버를 띄울 때의 이 컴퓨터 IPv4 주소만 허용한다 (운영 빌드에는 영향 없음).
 */
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  // 인증 앱: 요청마다 사용자별 데이터가 달라지므로 Cache Components(자동 캐시)는 사용하지 않는다.
  // 인증 페이지는 cookies() 읽기로 동적 렌더링되고, 파일 응답은 Cache-Control: private, no-store를 명시한다.
  cacheComponents: false,
  poweredByHeader: false,
  allowedDevOrigins: lanHosts,
  // Docker 배포용 최소 산출물. HWPX 템플릿은 코드에서 동적으로 읽으므로 추적 대상에 명시한다.
  output: "standalone",
  outputFileTracingIncludes: { "/**": ["./src/features/activity/templates/**"] },
  serverExternalPackages: ["sharp", "pg"],
  // forbidden()로 권한 없음(403)을 명시적으로 응답한다.
  experimental: { authInterrupts: true },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (process.env.NODE_ENV === "production") {
      common.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: common }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
