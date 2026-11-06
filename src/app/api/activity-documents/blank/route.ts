import { reportService } from "@/features/activity/instance";
import { HWPX_MIME } from "@/features/activity/hwpx";
import { apiRoute, contentDisposition } from "@/lib/http";

export const GET = apiRoute(async (_request, principal) => {
  const bytes = await reportService().createBlank(principal.memberId);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": HWPX_MIME,
      "Content-Disposition": contentDisposition("attachment", "반디_동아리_활동_내역서_양식.hwpx"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
