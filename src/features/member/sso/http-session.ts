import https from "node:https";
import { SchoolSsoResponseChangedError, SchoolSsoUnavailableError } from "../errors";

export interface SchoolSsoHttpResponse {
  statusCode: number;
  finalUrl: URL;
  body: string;
}

/** 쿠키를 유지하며 허용된 출처로만 리다이렉트를 따라가는 HTTP 세션. */
export interface SchoolSsoHttpSession {
  get(url: string): Promise<SchoolSsoHttpResponse>;
  postForm(url: string, referer: string, form: Record<string, string>): Promise<SchoolSsoHttpResponse>;
}

export interface SsoHttpOptions {
  allowedOrigins: string[];
  userAgent: string;
  requestTimeoutMs: number;
}

const MAX_REDIRECTS = 10;

export function originOf(url: URL): string {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}`;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export function createFetchSsoSession(options: SsoHttpOptions): SchoolSsoHttpSession {
  const jar = new Map<string, Map<string, string>>(); // hostname -> name -> value
  const allowed = new Set(options.allowedOrigins);

  const cookieHeader = (url: URL): string | undefined => {
    const cookies = jar.get(url.hostname);
    if (!cookies || cookies.size === 0) {
      return undefined;
    }
    return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  };

  const storeCookies = (url: URL, setCookie: string[]): void => {
    for (const line of setCookie) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const bucket = jar.get(url.hostname) ?? new Map<string, string>();
      bucket.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      jar.set(url.hostname, bucket);
    }
  };

  interface RawResponse {
    status: number;
    location: string | null;
    setCookie: string[];
    body: string;
  }

  /**
   * 학교 포털(portal.tukorea.ac.kr)은 규격에 어긋난 헤더를 보내 엄격한 파서(fetch/undici)가 거부한다.
   * 허용된 출처(allowedOrigins)로만 요청하므로 이 세션에 한해 느슨한 HTTP 파서를 켠다.
   */
  const sendOnce = (url: URL, init: { method: "GET" | "POST"; referer?: string; body?: string }): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
      const headers: Record<string, string> = { "User-Agent": options.userAgent, "Accept-Encoding": "identity" };
      const cookie = cookieHeader(url);
      if (cookie) {
        headers.Cookie = cookie;
      }
      if (init.referer) {
        headers.Referer = init.referer;
      }
      if (init.body !== undefined) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        headers["Content-Length"] = String(Buffer.byteLength(init.body));
      }
      const request = https.request(
        url,
        { method: init.method, headers, insecureHTTPParser: true, timeout: options.requestTimeoutMs },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("error", () => reject(new SchoolSsoUnavailableError()));
          response.on("end", () => {
            const raw = response.headers.location;
            const setCookie = response.headers["set-cookie"] ?? [];
            storeCookies(url, setCookie);
            resolve({
              status: response.statusCode ?? 0,
              location: Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null),
              setCookie,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("timeout")));
      request.on("error", () => reject(new SchoolSsoUnavailableError()));
      if (init.body !== undefined) {
        request.write(init.body);
      }
      request.end();
    });

  const send = async (
    start: URL,
    init: { method: "GET" | "POST"; referer?: string; body?: string },
  ): Promise<SchoolSsoHttpResponse> => {
    let current = start;
    let request = init;
    for (let redirects = 0; ; redirects++) {
      const response = await sendOnce(current, request);
      if (!isRedirect(response.status)) {
        return {
          statusCode: response.status,
          finalUrl: current,
          body: response.body,
        };
      }
      if (redirects >= MAX_REDIRECTS) {
        throw new SchoolSsoResponseChangedError();
      }
      const location = response.location;
      if (!location) {
        throw new SchoolSsoResponseChangedError();
      }
      let target: URL;
      try {
        target = new URL(location, current);
      } catch {
        throw new SchoolSsoResponseChangedError();
      }
      if (target.protocol !== current.protocol || !allowed.has(originOf(target))) {
        throw new SchoolSsoResponseChangedError();
      }
      if (response.status === 307 || response.status === 308) {
        // 본문을 유지해 재전송하는 리다이렉트는 같은 출처에서만 허용한다.
        if (originOf(current) !== originOf(target)) {
          throw new SchoolSsoResponseChangedError();
        }
        request = { ...request, referer: current.toString() };
      } else {
        request = { method: "GET", referer: current.toString() };
      }
      current = target;
    }
  };

  return {
    get: (url) => send(new URL(url), { method: "GET" }),
    postForm: (url, referer, form) =>
      send(new URL(url), {
        method: "POST",
        referer,
        body: new URLSearchParams(form).toString(),
      }),
  };
}
