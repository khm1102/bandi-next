import { describe, expect, it } from "vitest";
import { fetchLinkPreviews, parsePreviewHtml, previewImageExtension } from "@/features/resource/link-preview";

describe("parsePreviewHtml", () => {
  it("Open Graph 메타를 우선 사용하고 이미지 URL을 절대 경로로 해석한다", () => {
    const html = `<html><head><title>fallback</title>
      <meta property="og:title" content="  공연  안내 ">
      <meta property="og:description" content="설명">
      <meta property="og:image" content="/img/poster.png"></head></html>`;
    expect(parsePreviewHtml(html, "https://example.com/post/1")).toEqual({
      title: "공연 안내",
      description: "설명",
      imageUrl: "https://example.com/img/poster.png",
    });
  });

  it("OG가 없으면 title과 meta description으로 대체한다", () => {
    const html = '<html><head><title>제목</title><meta name="description" content="요약"></head></html>';
    expect(parsePreviewHtml(html, "https://example.com")).toEqual({ title: "제목", description: "요약", imageUrl: null });
  });

  it("길이를 제한하고 잘못된 이미지 URL은 무시한다", () => {
    const html = `<meta property="og:title" content="${"가".repeat(800)}"><meta property="og:image" content="http://[bad">`;
    const parsed = parsePreviewHtml(html, "https://example.com");
    expect(parsed.title?.length).toBe(500);
    expect(parsed.imageUrl).toBeNull();
  });
});

describe("previewImageExtension", () => {
  it("JPEG·PNG·WebP만 허용한다", () => {
    expect(previewImageExtension("image/png; charset=binary")).toBe("png");
    expect(previewImageExtension("image/jpeg")).toBe("jpg");
    expect(previewImageExtension("image/svg+xml")).toBeNull();
    expect(previewImageExtension("text/html")).toBeNull();
  });
});

describe("fetchLinkPreviews SSRF 차단 (네트워크 접속 없이)", () => {
  it("내부·비공개 주소는 요청하지 않고 건너뛴다", async () => {
    const results = await fetchLinkPreviews([
      "https://127.0.0.1/",
      "https://localhost/",
      "http://example.com/",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "https://intranet/",
    ]);
    expect(results).toEqual([]);
  });

  it("공인 IP로 해석되지 않는 호스트(.invalid)는 DNS 단계에서 실패하고 조용히 건너뛴다", async () => {
    await expect(fetchLinkPreviews(["https://does-not-exist.invalid/page"])).resolves.toEqual([]);
  });
});
