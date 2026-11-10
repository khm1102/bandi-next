import type { MemberStatus, Role } from "./codes";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "운영진", LEADER: "팀장", MEMBER: "일반 부원" };

export const STATUS_LABEL: Record<MemberStatus, string> = {
  PRE_REGISTERED: "사전 등록",
  ACTIVE: "활동 중",
  SUSPENDED: "활동 중지",
  WITHDRAWN: "탈퇴",
  REGISTRATION_CANCELLED: "등록 취소",
};

export const SSO_LABEL: Record<string, string> = { WAITING: "연결 대기", LINKED: "연결 완료", REVIEW_REQUIRED: "확인 필요" };
export const ACADEMIC_LABEL: Record<string, string> = { ENROLLED: "재학", LEAVE_OF_ABSENCE: "휴학", GRADUATED: "졸업", UNKNOWN: "확인 필요" };
