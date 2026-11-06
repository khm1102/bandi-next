import type { MemberStatus, SsoLinkStatus } from "./codes";
import { hasSameName, isLoginAllowed, type SchoolIdentity } from "./sso/identity";

export type ConnectionOutcome =
  | "AUTHENTICATED"
  | "ACADEMIC_STATUS_DENIED"
  | "IDENTITY_REVIEW_REQUIRED"
  | "MEMBER_STATUS_DENIED";

export interface LinkableMember {
  studentNo: string;
  name: string;
  status: MemberStatus;
  ssoLinkStatus: SsoLinkStatus;
  ssoLinkedAt: Date | null;
  lastLoginAt: Date | null;
}

export interface SchoolConnection {
  outcome: ConnectionOutcome;
  status: MemberStatus;
  ssoLinkStatus: SsoLinkStatus;
  ssoLinkedAt: Date | null;
  lastLoginAt: Date | null;
  /** 상태가 PRE_REGISTERED → ACTIVE로 바뀌어 이력을 남겨야 하는지 */
  statusChanged: boolean;
}

/**
 * 학교 인증 결과와 사전 등록 멤버를 연결한다 (Java Member.determineSchoolConnection 이식).
 * - 학번 불일치는 호출 전에 검증된다.
 * - 재학생이 아니면 연결하지 않고 거부한다.
 * - 이름 불일치, 또는 ACTIVE인데 SSO가 LINKED가 아니면 운영 검토 대기다.
 */
export function determineSchoolConnection(
  member: LinkableMember,
  identity: SchoolIdentity,
  verifiedAt: Date,
): SchoolConnection {
  const unchanged = (outcome: ConnectionOutcome, ssoLinkStatus = member.ssoLinkStatus) => ({
    outcome,
    status: member.status,
    ssoLinkStatus,
    ssoLinkedAt: member.ssoLinkedAt,
    lastLoginAt: member.lastLoginAt,
    statusChanged: false,
  });

  if (identity.studentNo !== member.studentNo) {
    throw new Error("학번이 등록 정보와 일치하지 않습니다");
  }
  if (!isLoginAllowed(identity.academicStatus)) {
    return unchanged("ACADEMIC_STATUS_DENIED");
  }
  if (member.status !== "PRE_REGISTERED" && member.status !== "ACTIVE") {
    return unchanged("MEMBER_STATUS_DENIED");
  }
  const cannotComplete = member.status === "ACTIVE" && member.ssoLinkStatus !== "LINKED";
  if (!hasSameName(identity, member.name) || cannotComplete) {
    return unchanged("IDENTITY_REVIEW_REQUIRED", "REVIEW_REQUIRED");
  }
  if (member.status === "PRE_REGISTERED") {
    return {
      outcome: "AUTHENTICATED",
      status: "ACTIVE",
      ssoLinkStatus: "LINKED",
      ssoLinkedAt: verifiedAt,
      lastLoginAt: verifiedAt,
      statusChanged: true,
    };
  }
  return {
    outcome: "AUTHENTICATED",
    status: member.status,
    ssoLinkStatus: "LINKED",
    ssoLinkedAt: member.ssoLinkedAt,
    lastLoginAt: verifiedAt,
    statusChanged: false,
  };
}
