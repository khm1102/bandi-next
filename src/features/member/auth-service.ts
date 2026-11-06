import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { member, memberChangeHistory, schoolLoginAttempt } from "./schema";
import type { MemberStatus, Role, SsoLinkStatus } from "./codes";
import { determineSchoolConnection, type ConnectionOutcome } from "./connection";
import {
  MemberLoginDeniedError,
  SchoolAcademicStatusDeniedError,
  SchoolCredentialsInvalidError,
  SchoolIdentityReviewRequiredError,
  SchoolLoginRateLimitedError,
  SchoolMemberNotRegisteredError,
} from "./errors";
import {
  isBlockedAt,
  isExpiredAt,
  recordFailure as nextFailureState,
  type LoginAttemptLimits,
} from "./login-attempt-policy";
import type { SchoolCredentials, SchoolSsoClient } from "./sso/client";
import type { SchoolIdentity } from "./sso/identity";

export interface AuthenticatedMember {
  memberId: number;
  role: Role;
  teamId: number;
}

export interface AuthServiceDeps {
  db: NodePgDatabase;
  sso: SchoolSsoClient;
  limits: LoginAttemptLimits;
  hashSecret: string;
  now?: () => Date;
}

const SSO_LINK_REASON = "학교 SSO 최초 연결";

/**
 * 학교 SSO 인증 → 실패 제한 → 사전 등록 멤버 연결.
 * 학번 원문·비밀번호는 실패 제한 저장소에 남기지 않는다(HMAC 해시만).
 */
export function createAuthService(deps: AuthServiceDeps) {
  const { db, sso, limits } = deps;
  const now = deps.now ?? (() => new Date());
  const hashStudentNo = (studentNo: string) =>
    createHmac("sha256", deps.hashSecret).update(studentNo).digest("hex");

  async function assertAllowed(studentNo: string): Promise<void> {
    const hash = hashStudentNo(studentNo);
    await db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(schoolLoginAttempt)
        .where(eq(schoolLoginAttempt.studentNoHash, hash))
        .for("update");
      if (!attempt) {
        return;
      }
      const current = now();
      if (isBlockedAt(attempt, current)) {
        throw new SchoolLoginRateLimitedError();
      }
      if (isExpiredAt(attempt, current, limits)) {
        await tx.delete(schoolLoginAttempt).where(eq(schoolLoginAttempt.studentNoHash, hash));
      }
    });
  }

  /** 실패를 기록하고 이번 실패로 차단되었는지 반환한다. */
  async function recordFailure(studentNo: string): Promise<boolean> {
    const hash = hashStudentNo(studentNo);
    return db.transaction(async (tx) => {
      await tx.insert(schoolLoginAttempt).values({ studentNoHash: hash }).onConflictDoNothing();
      const [attempt] = await tx
        .select()
        .from(schoolLoginAttempt)
        .where(eq(schoolLoginAttempt.studentNoHash, hash))
        .for("update");
      const current = now();
      const next = nextFailureState(attempt, current, limits);
      await tx
        .update(schoolLoginAttempt)
        .set({
          failureCount: next.failureCount,
          firstFailureAt: next.firstFailureAt,
          blockedUntil: next.blockedUntil,
        })
        .where(eq(schoolLoginAttempt.studentNoHash, hash));
      return isBlockedAt(next, current);
    });
  }

  async function clearFailures(studentNo: string): Promise<void> {
    await db.delete(schoolLoginAttempt).where(eq(schoolLoginAttempt.studentNoHash, hashStudentNo(studentNo)));
  }

  /** 연결 결과를 커밋한 뒤 반환한다. 거부 사유(검토 대기 표시 등)도 롤백되지 않도록 예외는 호출부에서 던진다. */
  async function connectSchoolIdentity(
    identity: SchoolIdentity,
  ): Promise<{ outcome: ConnectionOutcome; member: AuthenticatedMember }> {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(member).where(eq(member.studentNo, identity.studentNo)).for("update");
      if (!row) {
        throw new SchoolMemberNotRegisteredError();
      }
      const verifiedAt = now();
      const connection = determineSchoolConnection(
        {
          studentNo: row.studentNo,
          name: row.name,
          status: row.status as MemberStatus,
          ssoLinkStatus: row.ssoLinkStatus as SsoLinkStatus,
          ssoLinkedAt: row.ssoLinkedAt,
          lastLoginAt: row.lastLoginAt,
        },
        identity,
        verifiedAt,
      );
      await tx
        .update(member)
        .set({
          department: identity.department ?? row.department,
          // SSO 응답에 유효한 번호가 없으면 기존 값을 지우지 않는다.
          phoneNumber: identity.phoneNumber ?? row.phoneNumber,
          academicStatus: identity.academicStatus,
          academicStatusVerifiedAt: verifiedAt,
          status: connection.status,
          ssoLinkStatus: connection.ssoLinkStatus,
          ssoLinkedAt: connection.ssoLinkedAt,
          lastLoginAt: connection.lastLoginAt,
        })
        .where(eq(member.id, row.id));
      if (connection.statusChanged) {
        await tx.insert(memberChangeHistory).values({
          memberId: row.id,
          field: "STATUS",
          oldValue: row.status,
          newValue: connection.status,
          reason: SSO_LINK_REASON,
          changedByMemberId: row.id,
          changedAt: verifiedAt,
        });
      }
      return {
        outcome: connection.outcome,
        member: { memberId: row.id, role: row.role as Role, teamId: row.teamId },
      };
    });
  }

  return {
    async authenticate(credentials: SchoolCredentials): Promise<AuthenticatedMember> {
      await assertAllowed(credentials.studentNo);
      let identity: SchoolIdentity;
      try {
        identity = await sso.authenticate(credentials);
      } catch (error) {
        if (error instanceof SchoolCredentialsInvalidError && (await recordFailure(credentials.studentNo))) {
          throw new SchoolLoginRateLimitedError();
        }
        throw error;
      }
      await clearFailures(credentials.studentNo);
      if (identity.studentNo !== credentials.studentNo) {
        // 입력 학번과 포털 응답 학번이 다르면 신뢰하지 않는다.
        throw new SchoolIdentityReviewRequiredError();
      }
      const { outcome, member: authenticated } = await connectSchoolIdentity(identity);
      switch (outcome) {
        case "AUTHENTICATED":
          return authenticated;
        case "ACADEMIC_STATUS_DENIED":
          throw new SchoolAcademicStatusDeniedError();
        case "IDENTITY_REVIEW_REQUIRED":
          throw new SchoolIdentityReviewRequiredError();
        case "MEMBER_STATUS_DENIED":
          throw new MemberLoginDeniedError();
      }
    },
  };
}
