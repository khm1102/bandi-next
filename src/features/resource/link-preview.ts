import dns from "node:dns";
import { createHash } from "node:crypto";
import type { LookupFunction } from "node:net";
import * as cheerio from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";
import { checkPreviewUrl, isPublicAddress } from "./net-guard";

export const MAX_PREVIEWS = 5;
const MAX_REDIRECTS = 3;
const HTML_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 3_000;

export interface LinkPreview {
  /** 사용자가 본문에 쓴 정규화 URL (리다이렉트 이전). 중복 수집 판단의 기준이다. */
  normalizedUrl: string;
  urlHash: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: { bytes: Buffer; contentType: string } | null;
}

/** 연결 시점에 DNS 결과를 검증한다 (DNS rebinding·이중 해석 우회 방지). 공인 주소가 아니면 연결하지 않는다. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 4);
      return;
    }
    const allowed = addresses.filter((entry) => isPublicAddress(entry.address));
    if (allowed.length === 0 || allowed.length !== addresses.length) {
      callback(new Error("blocked-address"), "", 4);
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, allowed);
      return;
    }
    callback(null, allowed[0].address, allowed[0].family);
  });
};

const agent = new Agent({ connect: { lookup: guardedLookup }, headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS });

async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchGuarded(start: string, maxBytes: number): Promise<{ url: URL; contentType: string; body: Buffer } | null> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkPreviewUrl(current);
    if (!check.ok || !check.url) return null;
    const response = await undiciFetch(check.url, {
      method: "GET",
      redirect: "manual",
      dispatcher: agent,
      headers: { "user-agent": "bandi-link-preview/1.0", accept: "text/html,application/xhtml+xml,image/*;q=0.8" },
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return null;
      current = new URL(location, check.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel();
      return null;
    }
    const body = await readLimited(response.body as ReadableStream<Uint8Array> | null, maxBytes);
    if (!body || body.length === 0) return null;
    return { url: check.url, contentType: (response.headers.get("content-type") ?? "").toLowerCase(), body };
  }
  return null;
}

export interface ParsedPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

const clip = (value: string | undefined | null, max: number) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** HTML에서 Open Graph 메타를 뽑는다. 이미지 URL은 페이지 기준 절대 URL로 해석한다. */
export function parsePreviewHtml(html: string, pageUrl: string): ParsedPreview {
  const $ = cheerio.load(html);
  const meta = (selector: string) => $(selector).first().attr("content");
  const rawImage = meta('meta[property="og:image"]');
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }
  return {
    title: clip(meta('meta[property="og:title"]') ?? $("title").first().text(), 500),
    description: clip(meta('meta[property="og:description"]') ?? meta('meta[name="description"]'), 1000),
    imageUrl,
  };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const previewImageExtension = (contentType: string) => IMAGE_TYPES[contentType.split(";")[0].trim()] ?? null;

/** 단독 줄 URL들의 링크 카드 정보를 수집한다. 실패한 URL은 조용히 건너뛴다 (본문은 일반 링크로 남는다). */
export async function fetchLinkPreviews(urls: string[]): Promise<LinkPreview[]> {
  const results: LinkPreview[] = [];
  for (const url of urls.slice(0, MAX_PREVIEWS)) {
    try {
      const page = await fetchGuarded(url, HTML_MAX_BYTES);
      if (!page || !(page.contentType.startsWith("text/html") || page.contentType.startsWith("application/xhtml+xml"))) continue;
      const parsed = parsePreviewHtml(page.body.toString("utf8"), page.url.toString());
      let image: LinkPreview["image"] = null;
      if (parsed.imageUrl) {
        const fetched = await fetchGuarded(parsed.imageUrl, IMAGE_MAX_BYTES).catch(() => null);
        if (fetched && previewImageExtension(fetched.contentType)) {
          image = { bytes: fetched.body, contentType: fetched.contentType.split(";")[0].trim() };
        }
      }
      results.push({
        normalizedUrl: url,
        urlHash: urlHash(url),
        domain: page.url.hostname,
        title: parsed.title,
        description: parsed.description,
        image,
      });
    } catch {
      continue;
    }
  }
  return results;
}

export const urlHash = (url: string) => createHash("sha256").update(url).digest("hex");
