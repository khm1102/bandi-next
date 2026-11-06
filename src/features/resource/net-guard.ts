import { isIP } from "node:net";

/**
 * 서버가 대신 요청해도 되는 공인 주소인지 판단한다 (SSRF 방어).
 * 사설망·루프백·링크로컬(클라우드 메타데이터 169.254.169.254 포함)·CGNAT·멀티캐스트·예약 대역은 모두 거부한다.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIPv4(address);
  }
  if (family === 6) {
    return isPublicIPv6(address);
  }
  return false;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b, c] = parts;
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (a === 0 || a === 10 || a === 127) return false; // 현재 네트워크, 사설, 루프백
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // 링크 로컬, 클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return false; // 사설
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF 프로토콜, TEST-NET-1
  if (a === 192 && b === 168) return false; // 사설
  if (a === 198 && (b === 18 || b === 19)) return false; // 벤치마크
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // 멀티캐스트, 예약, 브로드캐스트
  return true;
}

function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  // IPv4 매핑/호환 주소(::ffff:a.b.c.d)는 내장 IPv4로 다시 판단한다.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicIPv4(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (lower === "::" || lower === "::1") return false;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 고유 로컬
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 링크 로컬
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 멀티캐스트
  if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) return false; // 문서용
  if (lower.startsWith("64:ff9b:")) return false; // NAT64 (내장 IPv4 우회 방지)
  return true;
}

export interface UrlCheck {
  ok: boolean;
  url?: URL;
}

/** 링크 카드 대상 URL: https, 표준 포트, 사용자 정보 없음, IP 리터럴/localhost 불가. */
export function checkPreviewUrl(value: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { ok: false };
  if (url.port && url.port !== "443") return { ok: false };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false };
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) return { ok: false };
  return { ok: true, url };
}

const STANDALONE = /^<?(https:\/\/[^\s<>]+)>?$/;

/** 본문에서 줄 전체가 HTTPS URL 하나인 줄만 모은다 (코드 블록 안은 제외, 중복 제거, 순서 유지). */
export function extractStandaloneUrls(markdown: string): string[] {
  const urls: string[] = [];
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```") || line.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = STANDALONE.exec(line);
    if (!match) continue;
    const check = checkPreviewUrl(match[1]);
    if (!check.ok || !check.url) continue;
    check.url.hash = "";
    const normalized = check.url.toString();
    if (!urls.includes(normalized)) urls.push(normalized);
  }
  return urls;
}
