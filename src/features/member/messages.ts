import type { LoginErrorCode } from "./errors";

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  "bad-credentials": "학번 또는 비밀번호가 올바르지 않습니다.",
  "login-rate-limited": "로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.",
  "member-not-registered": "등록되지 않은 학번입니다. 운영진에게 사전 등록을 요청해 주세요.",
  "link-pending": "등록 정보와 학교 인증 정보가 일치하지 않아 운영진 확인이 필요합니다.",
  "academic-restricted": "재학생만 로그인할 수 있습니다.",
  "member-restricted": "현재 상태에서는 로그인할 수 없습니다. 운영진에게 문의해 주세요.",
  "school-unavailable": "학교 인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

export const GENERIC_LOGIN_ERROR = LOGIN_ERROR_MESSAGES["school-unavailable"];
