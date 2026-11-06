import {
  SchoolCredentialsInvalidError,
  SchoolSsoResponseChangedError,
  SchoolSsoUnavailableError,
} from "../errors";
import { encryptCredential } from "./aes";
import type { SchoolSsoHttpResponse, SchoolSsoHttpSession } from "./http-session";
import type { SchoolIdentity } from "./identity";
import { extractAlert, extractEncryptionKey, extractIdentity, looksLikeLoginPage } from "./parser";

export interface SchoolCredentials {
  studentNo: string;
  password: string;
}

export interface SchoolSsoClient {
  authenticate(credentials: SchoolCredentials): Promise<SchoolIdentity>;
}

const PORTAL_HOST = "portal.tukorea.ac.kr";

export interface TukoreaSsoConfig {
  loginPageUrl: string;
  loginProcessUrl: string;
}

function validateStatus(response: SchoolSsoHttpResponse): void {
  if (response.statusCode >= 500) {
    throw new SchoolSsoUnavailableError();
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new SchoolSsoResponseChangedError();
  }
}

/** 한국공학대 학교 포털 SSO. 자격증명은 이 함수 밖으로 저장·로깅되지 않는다. */
export function createTukoreaSsoClient(
  config: TukoreaSsoConfig,
  newSession: () => SchoolSsoHttpSession,
  now: () => number = Date.now,
): SchoolSsoClient {
  return {
    async authenticate(credentials) {
      const session = newSession();
      const loginPage = await session.get(config.loginPageUrl);
      validateStatus(loginPage);
      const keyHex = extractEncryptionKey(loginPage.body);

      const timestamp = now();
      const portal = await session.postForm(config.loginProcessUrl, config.loginPageUrl, {
        internalId: encryptCredential(credentials.studentNo, timestamp, keyHex),
        internalPw: encryptCredential(credentials.password, timestamp, keyHex),
        externalId: "",
        externalPw: "",
        gubun: "inter",
      });
      validateStatus(portal);

      if (looksLikeLoginPage(portal.body)) {
        const alert = extractAlert(portal.body);
        if (alert?.includes("인증에 실패")) {
          throw new SchoolCredentialsInvalidError();
        }
        throw new SchoolSsoResponseChangedError();
      }
      if (portal.finalUrl.hostname.toLowerCase() !== PORTAL_HOST) {
        throw new SchoolSsoResponseChangedError();
      }
      return extractIdentity(portal.body);
    },
  };
}
