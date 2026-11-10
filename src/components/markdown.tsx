import type { SafeMarkdownHtml } from "@/features/notice/markdown";

/**
 * 서버에서 정화된 Markdown HTML만 출력한다. SafeMarkdownHtml은 renderMarkdown으로만 만들 수 있어
 * 정화되지 않은 문자열을 넘길 수 없다 (JSP의 markdown.tag 대응). 스타일은 원본 markdown.css(.markdown-content).
 */
export function Markdown({ html, className = "" }: { html: SafeMarkdownHtml; className?: string }) {
  return <div className={`markdown-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html.value }} />;
}
