import { adminService } from "@/features/admin/instance";
import { InvalidInputError } from "@/features/member/errors";
import { apiRoute, positiveId } from "@/lib/http";

/** 공지 하나의 대상 멤버별 확인 현황 CSV (운영진 전용). */
export const GET = apiRoute(async (request, principal) => {
  const noticeId = positiveId(new URL(request.url).searchParams.get("noticeId") ?? "");
  if (noticeId === null) throw new InvalidInputError();
  const { csv } = await adminService().exportNoticeReadsCsv(principal.memberId, noticeId);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notice-${noticeId}-reads.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
