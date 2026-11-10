import type { LoginErrorCode } from "./errors";

export interface LoginErrorText {
  title: string;
  message: string;
}

/** 원본 AuthenticationController의 로그인 오류 문구. */
export const LOGIN_ERROR_TEXT: Record<LoginErrorCode, LoginErrorText> = {
  "school-unavailable": { title: "학교 로그인 서비스 장애", message: "학교 시스템에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
  "bad-credentials": { title: "학교 계정 확인 필요", message: "학교 포털 아이디와 비밀번호를 다시 확인해 주세요." },
  "login-rate-limited": { title: "로그인 잠시 제한", message: "학교 포털 계정 보호를 위해 15분 뒤에 다시 시도해 주세요." },
  "member-not-registered": { title: "멤버 사전 등록 필요", message: "운영진이 학번을 먼저 등록해야 합니다. 동아리 운영진에게 문의해 주세요." },
  "link-pending": { title: "학교 계정 연결 대기", message: "학교 계정 확인은 완료됐지만 멤버 연결이 아직 처리되지 않았습니다." },
  "academic-restricted": { title: "학적 상태 확인 필요", message: "반디 운영 포털은 현재 학교 시스템에서 재학생으로 확인되는 멤버만 이용할 수 있습니다." },
  "password-setup-expired": { title: "비밀번호 설정 시간 만료", message: "학교 계정 인증 후 10분 안에 비밀번호를 정해야 해요. 학교 계정 인증을 처음부터 다시 진행해 주세요." },
  "member-restricted": { title: "멤버 이용 상태 확인 필요", message: "현재 멤버 상태로는 로그인할 수 없습니다. 동아리 운영진에게 문의해 주세요." },
};

export const GENERIC_LOGIN_ERROR = LOGIN_ERROR_TEXT["school-unavailable"];

/** 반디 비밀번호 로그인 화면의 문구: 학번이 없는지, 비밀번호가 틀렸는지는 구분해 알리지 않는다. */
export const PASSWORD_LOGIN_ERROR_TEXT: Record<LoginErrorCode, LoginErrorText> = {
  ...LOGIN_ERROR_TEXT,
  "bad-credentials": { title: "로그인 정보 확인 필요", message: "학번 또는 비밀번호를 다시 확인해 주세요. 처음이거나 비밀번호를 잊었다면 학교 계정 인증으로 설정할 수 있어요." },
  "login-rate-limited": { title: "로그인 잠시 제한", message: "로그인 실패가 반복되어 15분 뒤에 다시 시도할 수 있어요. 비밀번호를 잊었다면 학교 계정 인증으로 다시 설정해 주세요." },
};
