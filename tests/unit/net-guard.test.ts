import { describe, expect, it } from "vitest";
import { checkPreviewUrl, extractStandaloneUrls, isPublicAddress } from "@/features/resource/net-guard";

describe("isPublicAddress (SSRF 방어)", () => {
  it.each([
    "8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e",
  ])("공인 주소 %s 는 허용한다", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "192.168.255.255", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255",
    "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "64:ff9b::7f00:1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.5", "::ffff:169.254.169.254", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
    "not-an-ip", "", "999.1.1.1", "1.2.3",
  ])("내부·예약·잘못된 주소 %j 는 거부한다", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("172.15.x / 172.32.x 같은 사설 대역 바깥은 허용한다 (경계)", () => {
    expect(isPublicAddress("172.15.0.1")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("100.63.0.1")).toBe(true);
    expect(isPublicAddress("100.128.0.1")).toBe(true);
  });
});

describe("checkPreviewUrl", () => {
  it("공개 https URL만 허용한다", () => {
    expect(checkPreviewUrl("https://example.com/page?x=1").ok).toBe(true);
    expect(checkPreviewUrl("https://sub.example.co.kr/").ok).toBe(true);
  });

  it.each([
    "http://example.com", "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)",
    "https://user:pw@example.com", "https://example.com:8443/", "https://localhost/", "https://foo.localhost/",
    "https://127.0.0.1/", "https://[::1]/", "https://10.0.0.1/", "https://intranet/", "https://printer.local/", "https://db.internal/",
    "not a url", "",
  ])("%j 는 거부한다", (url) => {
    expect(checkPreviewUrl(url).ok).toBe(false);
  });
});

describe("extractStandaloneUrls", () => {
  it("단독 줄 https URL만 추출하고 중복은 제거한다", () => {
    const md = "소개\nhttps://example.com/a\n\n문장 속 https://inline.example.com/x 링크\nhttps://example.com/a\n<https://example.org/b>\n";
    expect(extractStandaloneUrls(md)).toEqual(["https://example.com/a", "https://example.org/b"]);
  });

  it("http, 내부 주소, 코드 블록 안 URL은 제외한다", () => {
    const md = "http://example.com/x\nhttps://127.0.0.1/\n```\nhttps://example.com/code\n```\nhttps://example.com/ok";
    expect(extractStandaloneUrls(md)).toEqual(["https://example.com/ok"]);
  });

  it("해시 조각은 제거해 정규화한다", () => {
    expect(extractStandaloneUrls("https://example.com/a#section")).toEqual(["https://example.com/a"]);
  });
});
