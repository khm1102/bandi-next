import type { BadgeTone } from "@/components/bandi/badge";
import type { NoticeStatus } from "./schema";

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  DRAFT: "초안",
  SCHEDULED: "예약",
  PUBLISHED: "게시 중",
  CLOSED: "게시 종료",
  ARCHIVED: "보관",
};

export const STATUS_TONE: Record<NoticeStatus, BadgeTone> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  PUBLISHED: "success",
  CLOSED: "warning",
  ARCHIVED: "neutral",
};
