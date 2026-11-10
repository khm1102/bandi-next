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

/** 원본 분류 코드. 자유 입력 값이 코드와 다르면 입력한 그대로 표시한다. */
export const CATEGORY_LABEL: Record<string, string> = {
  PROP: "소품",
  COSTUME: "의상",
  LIGHTING: "조명 장비",
  AUDIO: "음향 장비",
  VIDEO: "영상 장비",
  EQUIPMENT: "기타 장비",
};
export const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? category;
export const TRACKING_SHORT_LABEL: Record<string, string> = { QUANTITY: "수량형", INDIVIDUAL: "개별 관리" };
