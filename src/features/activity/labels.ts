import type { ActivityStatus } from "./schema";

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: "초안",
  SUBMITTED: "제출됨",
  TEAM_APPROVED: "팀장 승인",
  APPROVED: "최종 승인",
  REVISION_REQUESTED: "보완 요청",
  ARCHIVED: "보관",
};
