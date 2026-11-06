import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { member, session } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { accessFor, type AccessContext } from "@/lib/policy";

/** 요청마다 DB에서 다시 읽은 현재 멤버 상태. 세션에는 권한을 캐시하지 않는다. */
export interface Principal {
  memberId: number;
  name: string;
  studentNo: string;
  role: Role;
  teamId: number;
  status: MemberStatus;
  access: AccessContext;
}

export interface SessionStoreDeps {
  db: NodePgDatabase;
  ttlMs: number;
  now?: () => Date;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSessionStore(deps: SessionStoreDeps) {
  const { db, ttlMs } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /** 새 세션을 만들고 쿠키에 담을 원문 토큰을 반환한다 (DB에는 해시만 저장). */
    async issue(memberId: number, userAgent: string | null): Promise<string> {
      const token = randomBytes(32).toString("base64url");
      const current = now();
      await db.insert(session).values({
        tokenHash: hashToken(token),
        memberId,
        expiresAt: new Date(current.getTime() + ttlMs),
        lastSeenAt: current,
        userAgent: userAgent?.slice(0, 300) ?? null,
      });
      return token;
    },

    /**
     * 유효한 세션이면 현재 멤버를 반환하고 만료를 연장(슬라이딩)한다.
     * 멤버가 ACTIVE가 아니면(휴학·탈퇴·정지 등) 세션을 폐기하고 null을 반환한다.
     */
    async resolve(token: string | undefined): Promise<Principal | null> {
      if (!token) {
        return null;
      }
      const tokenHash = hashToken(token);
      const current = now();
      const [row] = await db
        .select({
          memberId: member.id,
          name: member.name,
          studentNo: member.studentNo,
          role: member.role,
          teamId: member.teamId,
          status: member.status,
        })
        .from(session)
        .innerJoin(member, eq(member.id, session.memberId))
        .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, current)));
      if (!row) {
        return null;
      }
      if (row.status !== "ACTIVE") {
        await db.delete(session).where(eq(session.tokenHash, tokenHash));
        return null;
      }
      await db
        .update(session)
        .set({ lastSeenAt: current, expiresAt: new Date(current.getTime() + ttlMs) })
        .where(eq(session.tokenHash, tokenHash));
      const subject = { ...row, role: row.role as Role, status: row.status as MemberStatus };
      return { ...subject, access: accessFor(subject) };
    },

    async revoke(token: string | undefined): Promise<void> {
      if (token) {
        await db.delete(session).where(eq(session.tokenHash, hashToken(token)));
      }
    },

    /** 멤버의 모든 세션 폐기 (권한·상태 변경 직후 사용). */
    async revokeAll(memberId: number): Promise<void> {
      await db.delete(session).where(eq(session.memberId, memberId));
    },

    async purgeExpired(): Promise<void> {
      await db.delete(session).where(lt(session.expiresAt, now()));
    },
  };
}
