import type { BadgeTone } from "@/components/bandi/badge";
import type { ActivityStatus } from "./schema";

/** 원본 activity/list.js STATUS_META (목록 화면의 상태 문구). */
export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: "작성 중",
  SUBMITTED: "검수 대기",
  TEAM_APPROVED: "팀장 승인",
  APPROVED: "최종 승인",
  REVISION_REQUESTED: "보완 요청",
  ARCHIVED: "보관",
};

export const ACTIVITY_STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  TEAM_APPROVED: "info",
  APPROVED: "success",
  REVISION_REQUESTED: "warning",
  ARCHIVED: "neutral",
};

export const RECORD_TYPE_LABEL = { SIMPLE: "간단 기록", HWPX: "한글 내역서" } as const;
