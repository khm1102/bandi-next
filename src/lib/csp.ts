/**
 * Content-Security-Policy 생성 (요청마다 새 nonce).
 * - 스크립트는 nonce가 있는 것만 실행한다 ('strict-dynamic'으로 Next가 불러오는 청크 허용).
 * - 개발 모드에서만 'unsafe-eval'(React 디버깅)을 허용한다.
 * - 이미지·파일은 같은 출처(+ blob/data 미리보기)만, 프레임·객체·base 변경은 금지한다.
 */
export function buildCsp(nonce: string, options: { dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    // 개발 서버(HMR)는 nonce 없는 <style>을 주입하므로 개발에서만 inline을 허용한다. 운영은 정적 CSS + nonce.
    options.dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!options.dev) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
