import type { MemberStatus, Role } from "@/features/member/codes";

/**
 * 인가 판단의 단일 정본. URL 경계(proxy)는 보조일 뿐이고, 모든 서비스는 이 정책을 통해
 * 팀·대상·상태 권한을 검사한다 (Java MemberAccessContext 이식).
 */
export interface AccessSubject {
  memberId: number;
  teamId: number;
  role: Role;
  status: MemberStatus;
}

export interface AccessContext {
  readonly memberId: number;
  readonly teamId: number;
  readonly admin: boolean;
  readonly leader: boolean;
  readonly active: boolean;
  canReadInternal(): boolean;
  canManageGlobal(): boolean;
  canManageTeam(targetTeamId: number | null): boolean;
  canChangeOwnTeam(targetMemberId: number): boolean;
  canContributeToTeam(targetTeamId: number | null): boolean;
}

export function accessFor(subject: AccessSubject): AccessContext {
  const admin = subject.role === "ADMIN";
  const leader = subject.role === "LEADER";
  const active = subject.status === "ACTIVE";
  return {
    memberId: subject.memberId,
    teamId: subject.teamId,
    admin,
    leader,
    active,
    canReadInternal: () => active,
    canManageGlobal: () => active && admin,
    canManageTeam: (targetTeamId) => {
      if (!active || targetTeamId === null) {
        return false;
      }
      return admin || (leader && subject.teamId === targetTeamId);
    },
    canChangeOwnTeam: (targetMemberId) => active && subject.memberId === targetMemberId,
    canContributeToTeam: (targetTeamId) => {
      if (!active || targetTeamId === null) {
        return false;
      }
      return admin || subject.teamId === targetTeamId;
    },
  };
}
