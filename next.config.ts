import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 인증 앱: 요청마다 사용자별 데이터가 달라지므로 Cache Components(자동 캐시)는 사용하지 않는다.
  // 인증 페이지는 cookies() 읽기로 동적 렌더링되고, 파일 응답은 Cache-Control: private, no-store를 명시한다.
  cacheComponents: false,
  poweredByHeader: false,
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
