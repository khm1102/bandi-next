export const ASSET_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "사용 가능",
  IN_USE: "사용 중",
  LOANED: "대여 중",
  REPAIR: "수리 중",
  LOST: "분실",
  DISPOSED: "폐기",
};
export const TRACKING_LABEL: Record<string, string> = { QUANTITY: "수량 관리", INDIVIDUAL: "개별 관리" };
export const OWNER_LABEL: Record<string, string> = { CLUB: "동아리", MEMBER: "개인", EXTERNAL: "외부" };
export const ACTION_LABEL: Record<string, string> = {
  REGISTER: "등록", ADJUST: "수량 조정", MOVE: "이동", LOAN: "대여·사용", RETURN: "반납", REPAIR: "수리",
  DAMAGE: "파손", LOST: "분실", DISPOSE: "폐기", DELETE: "삭제", RESTORE: "복구",
};
