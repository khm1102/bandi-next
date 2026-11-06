import { describe, expect, it } from "vitest";
import { createTukoreaSsoClient } from "@/features/member/sso/client";
import type { SchoolSsoHttpResponse, SchoolSsoHttpSession } from "@/features/member/sso/http-session";
import { createFakeSsoClient } from "@/features/member/sso/fake";
import { SchoolCredentialsInvalidError, SchoolSsoResponseChangedError } from "@/features/member/errors";

const config = {
  loginPageUrl: "https://ksc.tukorea.ac.kr/sso/login_stand.jsp",
  loginProcessUrl: "https://ksc.tukorea.ac.kr/sso/login_proc.jsp?returnurl=null",
};
const KEY_PAGE = '<script>var keyHex = "00112233445566778899aabbccddeeff";</script>';
const PORTAL_OK = `<h3>홍길동 님</h3><script>var loginId = "2025591010"; var groupName = "재학생";</script>`;

function fakeSession(login: SchoolSsoHttpResponse, forms: Record<string, string>[] = []): SchoolSsoHttpSession {
  return {
    get: async () => ({ statusCode: 200, finalUrl: new URL(config.loginPageUrl), body: KEY_PAGE }),
    postForm: async (_url, _referer, form) => {
      forms.push(form);
      return login;
    },
  };
}
const portal = (body: string, host = "portal.tukorea.ac.kr"): SchoolSsoHttpResponse => ({
  statusCode: 200,
  finalUrl: new URL(`https://${host}/main`),
  body,
});
const creds = { studentNo: "2025591010", password: "secret-pw" };

describe("Tukorea SSO 클라이언트", () => {
  it("성공하면 신원을 반환하고 폼에는 평문 자격증명이 들어가지 않는다", async () => {
    const forms: Record<string, string>[] = [];
    const client = createTukoreaSsoClient(config, () => fakeSession(portal(PORTAL_OK), forms), () => 1000);
    const identity = await client.authenticate(creds);
    expect(identity).toMatchObject({ studentNo: "2025591010", name: "홍길동", academicStatus: "ENROLLED" });
    expect(forms).toHaveLength(1);
    expect(forms[0].gubun).toBe("inter");
    expect(JSON.stringify(forms[0])).not.toContain("secret-pw");
    expect(forms[0].internalId).not.toContain("2025591010");
  });

  it("로그인 페이지가 다시 오고 '인증에 실패' 알림이면 자격증명 오류다", async () => {
    const failed = portal("<form id=\"loginForm\"></form><script>alert('인증에 실패하였습니다');</script>");
    const client = createTukoreaSsoClient(config, () => fakeSession(failed));
    await expect(client.authenticate(creds)).rejects.toBeInstanceOf(SchoolCredentialsInvalidError);
  });

  it("로그인 페이지가 다시 오지만 알림이 없으면 응답 변경이다 (실패 횟수에 포함하지 않는다)", async () => {
    const changed = portal('<form id="loginForm"></form>');
    const client = createTukoreaSsoClient(config, () => fakeSession(changed));
    await expect(client.authenticate(creds)).rejects.toBeInstanceOf(SchoolSsoResponseChangedError);
  });

  it("최종 호스트가 포털이 아니면 응답 변경이다", async () => {
    const client = createTukoreaSsoClient(config, () => fakeSession(portal(PORTAL_OK, "evil.example.com")));
    await expect(client.authenticate(creds)).rejects.toBeInstanceOf(SchoolSsoResponseChangedError);
  });

  it("서버 오류(5xx)는 일시 장애로 분류한다", async () => {
    const down = { statusCode: 503, finalUrl: new URL(config.loginProcessUrl), body: "" };
    const client = createTukoreaSsoClient(config, () => fakeSession(down));
    await expect(client.authenticate(creds)).rejects.toMatchObject({ loginCode: "school-unavailable" });
  });
});

describe("가짜 SSO (로컬·E2E 전용)", () => {
  it("등록된 계정과 비밀번호 pw로만 인증한다", async () => {
    const client = createFakeSsoClient();
    await expect(client.authenticate({ studentNo: "9000000001", password: "pw" })).resolves.toMatchObject({
      name: "MemberA",
      academicStatus: "ENROLLED",
    });
    await expect(client.authenticate({ studentNo: "9000000001", password: "x" })).rejects.toBeInstanceOf(
      SchoolCredentialsInvalidError,
    );
    await expect(client.authenticate({ studentNo: "1", password: "pw" })).rejects.toBeInstanceOf(
      SchoolCredentialsInvalidError,
    );
  });
});
