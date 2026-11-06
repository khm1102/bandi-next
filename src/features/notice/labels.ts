import type { NoticeStatus } from "./schema";

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  DRAFT: "초안",
  SCHEDULED: "예약",
  PUBLISHED: "게시 중",
  CLOSED: "종료",
  ARCHIVED: "보관",
};
