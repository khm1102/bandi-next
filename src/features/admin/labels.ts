import type { AuditAction } from "@/features/audit/schema";

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  MEMBER_TEAM_CHANGED: "소속 팀 변경",
  MEMBER_COHORT_CHANGED: "기수 변경",
  MEMBER_ROLE_CHANGED: "역할 변경",
  MEMBER_STATUS_CHANGED: "활동 상태 변경",
  ASSET_DELETED: "소품·장비 삭제",
  ASSET_RESTORED: "소품·장비 복구",
  SETTINGS_CHANGED: "화면 설정 변경",
  MEMBER_PASSWORD_RESET: "비밀번호 재설정 요구",
  MEMBER_LOGIN_UNLOCKED: "로그인 잠금 해제",
  DATA_EXPORTED: "데이터 내보내기",
};
