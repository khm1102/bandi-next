import { ACTIVITY_STATUSES, type ActivityStatus } from "@/features/activity/schema";
import { activityService } from "@/features/activity/instance";
import { apiRoute } from "@/lib/http";
import { parseKst } from "@/lib/kst";

/** 필터 전체 기준 CSV (ADMIN 전용). 본문·사진·학번은 담지 않는다. */
export const GET = apiRoute(async (request, principal) => {
  const q = new URL(request.url).searchParams;
  const status = ACTIVITY_STATUSES.find((s) => s === q.get("status")) as ActivityStatus | undefined;
  const teamId = Number(q.get("teamId")) || undefined;
  const from = q.get("from") ? parseKst(q.get("from")) : undefined;
  const to = q.get("to") ? parseKst(q.get("to")) : undefined;
  const csv = await activityService().exportReviewCsv(principal.memberId, {
    status,
    teamId,
    keyword: q.get("q") ?? undefined,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="activity-records.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
