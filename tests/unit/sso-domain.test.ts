import { describe, expect, it } from "vitest";
import { extractAlert, extractEncryptionKey, extractIdentity, looksLikeLoginPage } from "@/features/member/sso/parser";
import {
  academicStatusFromPortalLabel,
  createSchoolIdentity,
  normalizePhoneNumber,
} from "@/features/member/sso/identity";
import { determineSchoolConnection, type LinkableMember } from "@/features/member/connection";
import {
  isBlockedAt,
  isExpiredAt,
  recordFailure,
  type LoginAttemptLimits,
  type LoginAttemptState,
} from "@/features/member/login-attempt-policy";

const portalHtml = (opts: { phone?: string; profileName?: string } = {}) => `
<html><body>
<h3 class="name">${opts.profileName ?? "홍길동"} 님</h3>
<div class="profile_02"><p> 컴퓨터공학부 (4학년) </p></div>
<div id="writeinfor"><span>연락처</span> ${opts.phone ?? "010-1234-5678"}</div>
<script>var loginId = "2025591010"; var name = "홍길동"; var groupName = "재학생";</script>
</body></html>`;

describe("SSO 로그인 페이지 파서", () => {
  it("암호화 키(keyHex)를 추출한다", () => {
    expect(extractEncryptionKey('<script>var keyHex = "00112233445566778899AABBCCDDEEFF";</script>')).toBe(
      "00112233445566778899AABBCCDDEEFF",
    );
  });

  it("키가 없으면 응답 변경 예외가 발생한다", () => {
    expect(() => extractEncryptionKey("<html></html>")).toThrow();
  });

  it("alert 메시지를 추출한다", () => {
    expect(extractAlert("<script>alert('인증에 실패했습니다');</script>")).toBe("인증에 실패했습니다");
    expect(extractAlert("<html></html>")).toBeNull();
  });

  it("로그인 폼이 남아 있으면 로그인 페이지로 판단한다", () => {
    expect(looksLikeLoginPage('<form id="loginForm">')).toBe(true);
    expect(looksLikeLoginPage("<input name=internalPw>")).toBe(true);
    expect(looksLikeLoginPage(portalHtml())).toBe(false);
  });
});

describe("SSO 포털 응답에서 신원 추출", () => {
  it("학번·이름·학과·학적·휴대폰 번호를 정규화해 반환한다", () => {
    expect(extractIdentity(portalHtml())).toEqual({
      studentNo: "2025591010",
      name: "홍길동",
      department: "컴퓨터공학부",
      academicStatus: "ENROLLED",
      phoneNumber: "01012345678",
    });
  });

  it("프로필 이름이 없으면 신원 스크립트의 name을 사용한다", () => {
    const html = portalHtml().replace(/<h3[^>]*>.*?<\/h3>/, "");
    expect(extractIdentity(html).name).toBe("홍길동");
  });

  it("휴대폰 번호가 없거나 형식이 틀리면 null로 두고 로그인은 유지한다", () => {
    expect(extractIdentity(portalHtml({ phone: "번호 없음" })).phoneNumber).toBeNull();
    expect(extractIdentity(portalHtml({ phone: "02-123-4567" })).phoneNumber).toBeNull();
  });

  it("필수 값(학번)이 없으면 응답 변경 예외가 발생한다", () => {
    expect(() => extractIdentity("<html></html>")).toThrow();
  });
});

describe("학적·휴대폰 정규화", () => {
  it("포털 학적 라벨을 매핑하고 로그인은 재학생만 허용한다", () => {
    expect(academicStatusFromPortalLabel("재학생")).toBe("ENROLLED");
    expect(academicStatusFromPortalLabel("휴학생")).toBe("LEAVE_OF_ABSENCE");
    expect(academicStatusFromPortalLabel("졸업생")).toBe("GRADUATED");
    expect(academicStatusFromPortalLabel("기타")).toBe("UNKNOWN");
    expect(academicStatusFromPortalLabel(null)).toBe("UNKNOWN");
  });

  it("휴대폰 번호는 숫자만 남기고 01[016789] 형식만 허용한다", () => {
    expect(normalizePhoneNumber("010-1234-5678")).toBe("01012345678");
    expect(normalizePhoneNumber("011 123 4567")).toBe("0111234567");
    expect(normalizePhoneNumber("012-123-4567")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });

  it("이름은 NFC로 정규화하고 빈 학번은 거부한다", () => {
    const decomposed = "한글".normalize("NFD");
    const identity = createSchoolIdentity({
      studentNo: " 2025 ",
      name: decomposed,
      academicStatus: "ENROLLED",
    });
    expect(identity.name).toBe("한글");
    expect(identity.studentNo).toBe("2025");
    expect(() => createSchoolIdentity({ studentNo: " ", name: "a", academicStatus: "ENROLLED" })).toThrow();
  });
});

describe("학교 신원과 멤버 연결 판정", () => {
  const verifiedAt = new Date("2026-11-07T00:00:00Z");
  const identity = createSchoolIdentity({
    studentNo: "2025591010",
    name: "홍길동",
    academicStatus: "ENROLLED",
  });
  const member = (overrides: Partial<LinkableMember> = {}): LinkableMember => ({
    studentNo: "2025591010",
    name: "홍길동",
    status: "PRE_REGISTERED",
    ssoLinkStatus: "WAITING",
    ssoLinkedAt: null,
    lastLoginAt: null,
    ...overrides,
  });

  it("사전 등록 멤버의 첫 인증은 ACTIVE·LINKED로 연결하고 상태 이력을 남긴다", () => {
    const result = determineSchoolConnection(member(), identity, verifiedAt);
    expect(result).toMatchObject({
      outcome: "AUTHENTICATED",
      status: "ACTIVE",
      ssoLinkStatus: "LINKED",
      statusChanged: true,
    });
    expect(result.ssoLinkedAt).toEqual(verifiedAt);
  });

  it("이미 연결된 활성 멤버는 마지막 로그인만 갱신한다", () => {
    const linkedAt = new Date("2026-01-01T00:00:00Z");
    const result = determineSchoolConnection(
      member({ status: "ACTIVE", ssoLinkStatus: "LINKED", ssoLinkedAt: linkedAt }),
      identity,
      verifiedAt,
    );
    expect(result).toMatchObject({ outcome: "AUTHENTICATED", statusChanged: false });
    expect(result.ssoLinkedAt).toEqual(linkedAt);
    expect(result.lastLoginAt).toEqual(verifiedAt);
  });

  it("이름이 다르면 운영 검토 대기로 표시한다", () => {
    const result = determineSchoolConnection(member({ name: "김철수" }), identity, verifiedAt);
    expect(result).toMatchObject({ outcome: "IDENTITY_REVIEW_REQUIRED", ssoLinkStatus: "REVIEW_REQUIRED" });
  });

  it("ACTIVE인데 SSO가 LINKED가 아니면 운영 검토 대기다", () => {
    const result = determineSchoolConnection(
      member({ status: "ACTIVE", ssoLinkStatus: "WAITING" }),
      identity,
      verifiedAt,
    );
    expect(result.outcome).toBe("IDENTITY_REVIEW_REQUIRED");
  });

  it("재학생이 아니면 연결하지 않고 거부한다", () => {
    const onLeave = createSchoolIdentity({
      studentNo: "2025591010",
      name: "홍길동",
      academicStatus: "LEAVE_OF_ABSENCE",
    });
    const result = determineSchoolConnection(member(), onLeave, verifiedAt);
    expect(result).toMatchObject({ outcome: "ACADEMIC_STATUS_DENIED", status: "PRE_REGISTERED" });
  });

  it.each(["SUSPENDED", "WITHDRAWN", "REGISTRATION_CANCELLED"] as const)(
    "%s 멤버는 로그인할 수 없다",
    (status) => {
      expect(determineSchoolConnection(member({ status }), identity, verifiedAt).outcome).toBe(
        "MEMBER_STATUS_DENIED",
      );
    },
  );

  it("학번이 다르면 예외가 발생한다", () => {
    expect(() => determineSchoolConnection(member({ studentNo: "1" }), identity, verifiedAt)).toThrow();
  });
});

describe("학교 로그인 실패 제한 규칙", () => {
  const limits: LoginAttemptLimits = { maxFailures: 5, failureWindowMs: 15 * 60_000, cooldownMs: 15 * 60_000 };
  const empty: LoginAttemptState = { failureCount: 0, firstFailureAt: null, blockedUntil: null };
  const t0 = new Date("2026-11-07T00:00:00Z");
  const after = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

  it("첫 실패는 횟수 1로 기록하고 차단하지 않는다", () => {
    const state = recordFailure(empty, t0, limits);
    expect(state).toEqual({ failureCount: 1, firstFailureAt: t0, blockedUntil: null });
  });

  it("창 안에서 5번째 실패하면 쿨다운 동안 차단한다", () => {
    let state = recordFailure(empty, t0, limits);
    for (let i = 1; i < 5; i++) {
      state = recordFailure(state, after(i), limits);
    }
    expect(state.failureCount).toBe(5);
    expect(isBlockedAt(state, after(5))).toBe(true);
    expect(isBlockedAt(state, after(4 + 15))).toBe(false);
  });

  it("4번 실패까지는 차단하지 않는다", () => {
    let state = recordFailure(empty, t0, limits);
    for (let i = 1; i < 4; i++) {
      state = recordFailure(state, after(i), limits);
    }
    expect(state.failureCount).toBe(4);
    expect(isBlockedAt(state, after(4))).toBe(false);
  });

  it("실패 창이 지나면 만료되어 다시 1부터 센다", () => {
    let state = recordFailure(empty, t0, limits);
    state = recordFailure(state, after(1), limits);
    expect(isExpiredAt(state, after(15), limits)).toBe(true);
    expect(recordFailure(state, after(16), limits)).toMatchObject({ failureCount: 1 });
  });

  it("차단 중에는 실패를 더 누적하지 않는다", () => {
    let state = recordFailure(empty, t0, limits);
    for (let i = 1; i < 5; i++) {
      state = recordFailure(state, after(i), limits);
    }
    expect(recordFailure(state, after(6), limits)).toBe(state);
  });
});
