import type { SafeMarkdownHtml } from "@/features/notice/markdown";

/**
 * 서버에서 정화된 Markdown HTML만 출력한다. SafeMarkdownHtml은 renderMarkdown으로만 만들 수 있어
 * 정화되지 않은 문자열을 넘길 수 없다 (JSP의 markdown.tag 대응).
 */
export function Markdown({ html }: { html: SafeMarkdownHtml }) {
  return (
    <div
      className="space-y-3 text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-black [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:font-bold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-secondary [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
      dangerouslySetInnerHTML={{ __html: html.value }}
    />
  );
}
