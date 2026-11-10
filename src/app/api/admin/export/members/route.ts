import { adminService } from "@/features/admin/instance";
import { apiRoute } from "@/lib/http";

/** 멤버 명단 CSV (운영진 전용, 내보낸 기록은 감사 로그에 남는다). */
export const GET = apiRoute(async (_request, principal) => {
  const csv = await adminService().exportMembersCsv(principal.memberId);
  return csvResponse(csv, "bandi-members.csv");
});

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
