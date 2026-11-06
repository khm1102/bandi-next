import { describe, expect, it } from "vitest";
import { extractAttachmentImageIds, renderMarkdown, SafeMarkdownHtml } from "@/features/notice/markdown";

const html = (md: string, opts?: Parameters<typeof renderMarkdown>[1]) => renderMarkdown(md, opts).value;

describe("Markdown 렌더링 (MarkdownRendererTest 이식)", () => {
  it("GFM 표와 코드, 링크를 안전한 HTML로 렌더링한다", () => {
    const out = html("## 안내\n\n| 항목 | 내용 |\n| --- | --- |\n| 장소 | 소극장 |\n\n`준비물`을 확인해 주세요. [동아리](https://bandi.example.com)\n");
    expect(out).toContain("<h2>안내</h2>");
    expect(out).toContain("<table>");
    expect(out).toContain("<code>준비물</code>");
    expect(out).toContain('href="https://bandi.example.com"');
  });

  it("원시 HTML, 스크립트 URL, HTTP 이미지를 제거한다", () => {
    const out = html(
      "<script>alert('xss')</script>\n[위험](javascript:alert(1))\n![HTTP 이미지](http://example.com/image.png)\n![HTTPS 이미지](https://example.com/image.png)\n<img src=x onerror=alert(1)>\n",
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("http://example.com/image.png");
    expect(out).not.toContain("onerror");
    expect(out).toContain("<img");
    expect(out).toContain("https://example.com/image.png");
  });

  it("첨부된 내부 이미지만 안전한 img 태그로 렌더링한다", () => {
    const out = html("![공연 포스터](attachment://42)", {
      imageUrls: new Map([[42, "/api/internal-notices/8/attachments/42/inline"]]),
    });
    expect(out).toContain("<img");
    expect(out).toContain("/api/internal-notices/8/attachments/42/inline");
    expect(out).toContain('alt="공연 포스터"');
  });
});

describe("Markdown 보안 추가 케이스", () => {
  it("매핑되지 않은 attachment 참조와 허용되지 않은 내부 URL은 제거한다", () => {
    expect(html("![x](attachment://99)")).not.toContain("<img");
    expect(html("![x](attachment://7)", { imageUrls: new Map([[7, "https://evil.example.com/a.png"]]) })).not.toContain("<img");
    expect(html("![x](attachment://7)", { imageUrls: new Map([[7, "javascript:alert(1)"]]) })).not.toContain("<img");
  });

  it("외부 이미지를 허용하지 않는 모드(자료실)에서는 외부 이미지를 제거한다", () => {
    expect(html("![x](https://example.com/a.png)", { allowExternalImages: false })).not.toContain("<img");
  });

  it("사용자 정보가 있는 URL 이미지는 제거한다", () => {
    expect(html("![x](https://user:pw@example.com/a.png)")).not.toContain("<img");
  });

  it("data: URL과 이벤트 속성, iframe, style은 제거한다", () => {
    const out = html('![x](data:image/png;base64,AAAA)\n\n<iframe src="https://evil.example.com"></iframe>\n\n<div style="x" onclick="a()">y</div>');
    expect(out).not.toContain("data:");
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("style");
  });

  it("링크는 새 탭에서 noopener noreferrer 로 열린다", () => {
    const out = html("[a](https://example.com)");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("mailto 링크는 허용하고 ftp·vbscript 링크는 제거한다", () => {
    expect(html("[m](mailto:a@b.com)")).toContain("mailto:a@b.com");
    expect(html("[f](ftp://x.com/a)")).not.toContain("ftp:");
    expect(html("[v](vbscript:x)")).not.toContain("vbscript");
  });

  it("텍스트로 쓴 태그는 이스케이프되어 실행되지 않는다", () => {
    const out = html("`<script>alert(1)</script>` 와 &lt;b&gt;");
    expect(out).not.toMatch(/<script/i);
  });

  it("id·class 같은 속성은 허용하지 않는다 (DOM clobbering 방지)", () => {
    expect(html('<a id="x" class="y" href="https://a.com">t</a>')).not.toContain('id="x"');
  });

  it("빈 입력과 null은 빈 문자열이다", () => {
    expect(html("")).toBe("");
    expect(renderMarkdown(null).value).toBe("");
  });

  it("SafeMarkdownHtml은 외부에서 직접 만들 수 없다", () => {
    expect(() => new SafeMarkdownHtml("<script>", Symbol("x"))).toThrow();
  });

  it("본문이 참조하는 attachment 이미지 ID를 추출한다", () => {
    expect([...extractAttachmentImageIds("![a](attachment://3) ![b](attachment://5) ![c](https://x.com/1.png)")].sort()).toEqual([3, 5]);
  });
});
