import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit, SKIP } from "unist-util-visit";
import type { Root as MdastRoot, Image, Parent } from "mdast";
import type { Root as HastRoot } from "hast";

const brand = Symbol("SafeMarkdownHtml");

/**
 * 서버가 정화한 HTML만 담는 값 타입. 이 모듈의 renderMarkdown만 만들 수 있고,
 * JSX의 dangerouslySetInnerHTML은 이 타입만 받는 Markdown 컴포넌트에서만 사용한다.
 */
export class SafeMarkdownHtml {
  readonly value: string;
  constructor(value: string, token: symbol) {
    if (token !== brand) {
      throw new Error("SafeMarkdownHtml은 renderMarkdown으로만 만들 수 있습니다.");
    }
    this.value = value;
  }
}

const ATTACHMENT = /^attachment:\/\/([1-9][0-9]*)$/;
/** 내부 이미지 URL은 인증이 필요한 우리 서버 경로만 허용한다. */
const INTERNAL_IMAGE_PREFIXES = ["/api/internal-notices/", "/api/internal-notice-management/", "/api/resources/"];

const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "blockquote",
    "ul", "ol", "li", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "img", "a",
  ],
  attributes: { a: ["href"], img: ["src", "alt", "title"] },
  protocols: { href: ["http", "https", "mailto"], src: ["http", "https"] },
  clobber: [],
  clobberPrefix: "",
};

function isSafeExternalImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname !== "" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

interface ImageOptions {
  imageUrls: ReadonlyMap<number, string>;
  allowExternalImages: boolean;
}

/** 이미지 정책: attachment://N 은 검증된 내부 URL로만 치환, 외부는 https만(허용 시), 나머지는 제거. */
const imagePolicy: Plugin<[ImageOptions], MdastRoot> = (options) => (tree) => {
  visit(tree, "image", (node: Image, index, parent: Parent | undefined) => {
    const attachment = ATTACHMENT.exec(node.url);
    let keep = false;
    if (attachment) {
      const internal = options.imageUrls.get(Number(attachment[1]));
      if (internal && INTERNAL_IMAGE_PREFIXES.some((prefix) => internal.startsWith(prefix))) {
        node.url = internal;
        keep = true;
      }
    } else if (options.allowExternalImages && isSafeExternalImage(node.url)) {
      keep = true;
    }
    if (!keep && parent && index !== undefined) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
    return undefined;
  });
};

/** 정화 이후 모든 링크를 새 탭 + noopener noreferrer 로 연다. */
const linkAttributes: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node) => {
    if (node.tagName === "a") {
      node.properties = { ...node.properties, rel: ["noopener", "noreferrer"], target: "_blank" };
    }
  });
};

function processor(options: ImageOptions) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(imagePolicy, options)
    // 원시 HTML 노드는 allowDangerousHtml 없이 버려지고, 남은 결과도 한 번 더 정화한다.
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(linkAttributes)
    .use(rehypeStringify);
}

export interface RenderOptions {
  /** attachment://N → 검증된 내부 이미지 URL */
  imageUrls?: ReadonlyMap<number, string>;
  /** 공지는 HTTPS 외부 이미지를 허용하고, 자료실은 내부 이미지만 허용한다. */
  allowExternalImages?: boolean;
}

export function renderMarkdown(markdown: string | null | undefined, options: RenderOptions = {}): SafeMarkdownHtml {
  const file = processor({
    imageUrls: options.imageUrls ?? new Map(),
    allowExternalImages: options.allowExternalImages ?? true,
  }).processSync(markdown ?? "");
  return new SafeMarkdownHtml(String(file), brand);
}

/** 본문이 참조하는 attachment://N 의 파일 ID 집합. */
export function extractAttachmentImageIds(markdown: string | null | undefined): Set<number> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown ?? "") as MdastRoot;
  const ids = new Set<number>();
  visit(tree, "image", (node: Image) => {
    const match = ATTACHMENT.exec(node.url);
    if (match) {
      ids.add(Number(match[1]));
    }
  });
  return ids;
}
