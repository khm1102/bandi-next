import { createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { hashToken } from "@/lib/session-store";
import { hashPassword, validateNewPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { member, memberChangeHistory, passwordSetupTicket, schoolLoginAttempt } from "./schema";
import type { MemberStatus, Role, SsoLinkStatus } from "./codes";
import { determineSchoolConnection, type ConnectionOutcome } from "./connection";
import {
  MemberLoginDeniedError,
  PasswordSetupExpiredError,
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
const SETUP_TICKET_TTL_MS = 10 * 60_000;

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

  /** 학교 SSO 인증 → 실패 제한 → 사전 등록 멤버 연결. 학교 비밀번호는 어디에도 저장하지 않는다. */
  async function verifySchool(credentials: SchoolCredentials): Promise<AuthenticatedMember> {
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
  }

  const ticketRow = async (token: string) => {
    const [ticket] = await db.select().from(passwordSetupTicket).where(eq(passwordSetupTicket.tokenHash, hashToken(token)));
    return ticket && ticket.usedAt === null && ticket.expiresAt.getTime() > now().getTime() ? ticket : null;
  };

  return {
    /** 학교 SSO 한 번으로 로그인 (최초 연결 검증용). 일상 로그인은 loginWithPassword를 쓴다. */
    authenticate: verifySchool,

    /** 반디 비밀번호 로그인: 학교 서버를 호출하지 않는다. 실패는 학번별로 센다. */
    async loginWithPassword(credentials: SchoolCredentials): Promise<AuthenticatedMember> {
      await assertAllowed(credentials.studentNo);
      const [row] = await db.select().from(member).where(eq(member.studentNo, credentials.studentNo));
      // 계정이 없거나 비밀번호가 없어도 같은 비용으로 검증해 응답 시간으로 존재 여부가 드러나지 않게 한다.
      const ok = row?.passwordHash ? await verifyPassword(credentials.password, row.passwordHash) : await verifyAgainstDummy(credentials.password);
      if (!ok || !row) {
        if (await recordFailure(credentials.studentNo)) {
          throw new SchoolLoginRateLimitedError();
        }
        throw new SchoolCredentialsInvalidError();
      }
      await clearFailures(credentials.studentNo);
      if (row.status !== "ACTIVE") {
        throw new MemberLoginDeniedError();
      }
      await db.update(member).set({ lastLoginAt: now() }).where(eq(member.id, row.id));
      return { memberId: row.id, role: row.role as Role, teamId: row.teamId };
    },

    /** 학교 SSO 인증을 통과하면 10분짜리 일회용 비밀번호 설정 티켓을 발급한다 (최초 설정·재설정 공통). */
    async verifySchoolForPasswordSetup(credentials: SchoolCredentials): Promise<{ token: string; memberId: number }> {
      const authenticated = await verifySchool(credentials);
      const token = randomBytes(32).toString("base64url");
      await db.transaction(async (tx) => {
        // 이전에 발급한 미사용 티켓은 무효화한다.
        await tx.delete(passwordSetupTicket).where(and(eq(passwordSetupTicket.memberId, authenticated.memberId), isNull(passwordSetupTicket.usedAt)));
        await tx.insert(passwordSetupTicket).values({
          memberId: authenticated.memberId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now().getTime() + SETUP_TICKET_TTL_MS),
        });
      });
      return { token, memberId: authenticated.memberId };
    },

    async isPasswordSetupTicketValid(token: string): Promise<boolean> {
      return (await ticketRow(token)) !== null;
    },

    /** 티켓으로 반디 비밀번호를 정한다. 정책 위반이면 티켓을 소모하지 않는다. */
    async setPasswordWithTicket(token: string, password: string, confirm: string): Promise<AuthenticatedMember> {
      return db.transaction(async (tx) => {
        const [ticket] = await tx
          .select()
          .from(passwordSetupTicket)
          .where(eq(passwordSetupTicket.tokenHash, hashToken(token)))
          .for("update");
        const current = now();
        if (!ticket || ticket.usedAt !== null || ticket.expiresAt.getTime() <= current.getTime()) {
          throw new PasswordSetupExpiredError();
        }
        const [row] = await tx.select().from(member).where(eq(member.id, ticket.memberId)).for("update");
        if (!row || row.status !== "ACTIVE") {
          throw new MemberLoginDeniedError();
        }
        validateNewPassword(row.studentNo, password, confirm);
        const hash = await hashPassword(password);
        await tx.update(member).set({ passwordHash: hash, passwordSetAt: current, lastLoginAt: current }).where(eq(member.id, row.id));
        await tx.update(passwordSetupTicket).set({ usedAt: current }).where(eq(passwordSetupTicket.id, ticket.id));
        await tx.delete(schoolLoginAttempt).where(eq(schoolLoginAttempt.studentNoHash, hashStudentNo(row.studentNo)));
        return { memberId: row.id, role: row.role as Role, teamId: row.teamId };
      });
    },
  };
}
