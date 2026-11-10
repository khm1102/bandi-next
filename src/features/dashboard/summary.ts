import "server-only";
import { activityService } from "@/features/activity/instance";
import { assetService } from "@/features/asset/instance";
import { calendarService } from "@/features/calendar/instance";
import { noticeService } from "@/features/notice/instance";
import { resourceService } from "@/features/resource/instance";
import type { Principal } from "@/lib/session-store";

const DAY_MS = 24 * 3600_000;
const KST = 9 * 3600_000;

/** 오늘(KST)의 [시작, 다음 날 시작). */
export function todayRange(now: Date): { start: Date; end: Date } {
  const startMs = Math.floor((now.getTime() + KST) / DAY_MS) * DAY_MS - KST;
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS) };
}

/**
 * 홈 요약: 별도 데이터를 저장하지 않고 각 feature의 읽기 서비스를 조합한다.
 * 권한이 필요한 항목은 각 서비스가 다시 검사한다.
 */
export async function loadDashboard(principal: Principal) {
  const actor = principal.memberId;
  const today = todayRange(new Date());
  const reviewer = principal.access.canManageGlobal() || principal.access.leader;
  const [todayEvents, upcoming, unread, notices, repair, lost, resources, revisions, pendingReview] = await Promise.all([
    calendarService().search(actor, { rangeStart: today.start, rangeEnd: today.end }),
    calendarService().upcoming(actor, 5),
    noticeService().searchReadable(actor, { unreadOnly: true }),
    noticeService().searchReadable(actor, {}),
    assetService().searchItems(actor, { status: "REPAIR" }),
    assetService().searchItems(actor, { status: "LOST" }),
    resourceService().search(actor, {}),
    activityService().searchMine(actor, { status: "REVISION_REQUESTED" }),
    reviewer ? activityService().searchReview(actor, { status: "SUBMITTED" }) : Promise.resolve(null),
  ]);
  return {
    todayEvents,
    todayEventCount: todayEvents.length,
    upcoming,
    unreadNoticeCount: unread.total,
    latestNotices: notices.items.slice(0, 5),
    notices: notices.items,
    cautionAssetCount: repair.total + lost.total,
    latestResources: resources.items.slice(0, 3),
    revisionRequestedCount: revisions.total,
    pendingReviewCount: pendingReview?.total ?? null,
  };
}
