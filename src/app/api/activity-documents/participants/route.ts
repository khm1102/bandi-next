import { reportService } from "@/features/activity/instance";
import { apiRoute } from "@/lib/http";

/** 참여자 자동완성: 이름·학과·학번만 반환한다 (휴대폰 등 제외). */
export const GET = apiRoute(async (request, principal) => {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const rows = await reportService().searchParticipants(principal.memberId, q);
  return Response.json(rows, { headers: { "Cache-Control": "private, no-store" } });
});
