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

  const storeCookies = (url: URL, headers: Headers): void => {
    for (const line of headers.getSetCookie()) {
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

  const sendOnce = async (
    url: URL,
    init: { method: "GET" | "POST"; referer?: string; body?: string },
  ): Promise<Response> => {
    const headers: Record<string, string> = { "User-Agent": options.userAgent };
    const cookie = cookieHeader(url);
    if (cookie) {
      headers.Cookie = cookie;
    }
    if (init.referer) {
      headers.Referer = init.referer;
    }
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    try {
      const response = await fetch(url, {
        method: init.method,
        headers,
        body: init.body,
        redirect: "manual",
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      storeCookies(url, response.headers);
      return response;
    } catch {
      throw new SchoolSsoUnavailableError();
    }
  };

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
          body: await response.text(),
        };
      }
      if (redirects >= MAX_REDIRECTS) {
        throw new SchoolSsoResponseChangedError();
      }
      const location = response.headers.get("location");
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
