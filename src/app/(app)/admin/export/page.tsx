import { buttonClass } from "@/components/bandi/button";
import { Card } from "@/components/bandi/card";
import { adminService } from "@/features/admin/instance";
import { guard } from "@/lib/page-errors";
import { requireRole } from "@/lib/session";

export const metadata = { title: "내보내기 · 운영 관리 · 반디" };
const DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

/** CSV 내려받기. 모든 내보내기는 감사 로그에 남고, 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. */
export default async function AdminExportPage() {
  const principal = await requireRole("ADMIN");
  const notices = await guard(adminService().exportableNotices(principal.memberId));
  return (
    <>
      <p className="mb-4 rounded-md border bg-accent/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
        내보낸 파일에는 개인정보(학번·휴대폰)가 들어 있어요. 필요한 곳에만 쓰고 공유 폴더에 오래 두지 마세요. 내보낸 기록은 감사 로그에 남아요.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card title="멤버 명단" icon="members">
          <p className="text-sm text-muted-foreground">학번·이름·팀·기수·역할·활동 상태·SSO 연결·휴대폰·마지막 로그인</p>
          <a href="/api/admin/export/members" className={`mt-4 ${buttonClass("primary")}`} download>멤버 명단 CSV</a>
        </Card>
        <Card title="활동 기록" icon="activity">
          <p className="text-sm text-muted-foreground">제출된 활동 기록의 팀·제목·활동 일시·참여 인원·작성자·상태·제출/검수 시각 (본문·사진 제외)</p>
          <a href="/api/activity-reviews/export" className={`mt-4 ${buttonClass("primary")}`} download>활동 기록 CSV</a>
        </Card>
        <Card title="공지 확인 현황" icon="bell">
          <form action="/api/admin/export/notice-reads" method="get" className="flex flex-col gap-3">
            <label className="text-sm text-muted-foreground" htmlFor="exportNotice">공지별 대상 멤버의 확인 여부와 확인 시각</label>
            <select id="exportNotice" name="noticeId" required className="h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm" defaultValue="">
              <option value="" disabled>공지를 선택해 주세요</option>
              {notices.map((n) => <option key={n.id} value={n.id}>{n.title}{n.publishStartAt ? ` (${DATE.format(n.publishStartAt)})` : ""}</option>)}
            </select>
            <button type="submit" className={buttonClass("primary")} disabled={notices.length === 0}>공지 확인 현황 CSV</button>
          </form>
        </Card>
      </div>
    </>
  );
}
