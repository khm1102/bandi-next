import { SchoolCredentialsInvalidError } from "../errors";
import type { SchoolCredentials, SchoolSsoClient } from "./client";
import { createSchoolIdentity } from "./identity";

/**
 * 로컬·E2E 전용 가짜 SSO (SCHOOL_SSO_MODE=fake, 운영에서는 env 검증이 거부).
 * 학번 → 이름 표에 있고 비밀번호가 "pw"일 때만 재학생으로 인증한다.
 */
export const FAKE_SSO_ACCOUNTS: Readonly<Record<string, string>> = {
  "9000000001": "MemberA",
  "9000000002": "MemberB",
  "9000000003": "LeaderA",
  "9000000004": "LeaderB",
  "9000000005": "AdminX",
};

export const FAKE_SSO_PASSWORD = "pw";

export function createFakeSsoClient(): SchoolSsoClient {
  return {
    async authenticate(credentials: SchoolCredentials) {
      const name = FAKE_SSO_ACCOUNTS[credentials.studentNo];
      if (!name || credentials.password !== FAKE_SSO_PASSWORD) {
        throw new SchoolCredentialsInvalidError();
      }
      return createSchoolIdentity({
        studentNo: credentials.studentNo,
        name,
        department: "Test",
        academicStatus: "ENROLLED",
      });
    },
  };
}
