import type { MemberStatus, Role } from "./codes";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "운영진", LEADER: "팀장", MEMBER: "멤버" };

export const STATUS_LABEL: Record<MemberStatus, string> = {
  PRE_REGISTERED: "사전 등록",
  ACTIVE: "활동 중",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
  REGISTRATION_CANCELLED: "등록 취소",
};
