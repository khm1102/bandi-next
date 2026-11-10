import Link from "next/link";
import type { ReactNode } from "react";
import { adminService } from "@/features/admin/instance";
import { isHomeBlockVisible, visibleHomeCards, type HomeCardKey } from "@/features/admin/settings-model";
import { Badge } from "@/components/bandi/badge";
import { Button } from "@/components/bandi/button";
import { Card } from "@/components/bandi/card";
import { EmptyState } from "@/components/bandi/empty-state";
import { Icon } from "@/components/bandi/icons";
import { StatCard } from "@/components/bandi/stat-card";
import { loadDashboard } from "@/features/dashboard/summary";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL } from "@/features/member/labels";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "홈 · 반디" };

const KST = "Asia/Seoul";
const todayLabel = () => new Intl.DateTimeFormat("ko-KR", { timeZone: KST, year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
const timeLabel = (date: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
const shortDate = (date: Date | null) => (date ? new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "numeric", day: "numeric" }).format(date) : "게시일 미정");

const QUICK = "flex min-h-11 items-center gap-3 rounded-md px-2 transition-colors hover:bg-secondary";

export default async function DashboardPage() {
  const principal = await requirePrincipal("/dashboard");
  const [data, profile, home] = await Promise.all([loadDashboard(principal), memberService().lookupProfile(principal.memberId), adminService().home()]);
  const role = ROLE_LABEL[principal.role];
  const important = data.notices.filter((notice) => notice.important);
  const visibleNotices = data.notices
    .filter((notice) => notice.important || !notice.isRead)
    .sort((a, b) => Number(b.important) - Number(a.important) || Number(a.isRead) - Number(b.isRead) || (b.publishStartAt?.getTime() ?? 0) - (a.publishStartAt?.getTime() ?? 0))
    .slice(0, 4);
  const manager = principal.role === "ADMIN" || principal.role === "LEADER";

  return (
    <>
      <div className="mb-5 flex min-w-0 flex-wrap items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">안녕하세요, {principal.name}님</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {todayLabel()} · {profile.department ? `${role} · ${profile.department}` : role}
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 md:ml-auto md:flex md:w-auto md:flex-wrap md:items-center">
          <Button href="/notices?unread=1" variant="outline">미확인 공지 보기</Button>
          {manager ? <Button href="/calendar">일정 관리</Button> : null}
        </div>
      </div>

      {isHomeBlockVisible(home, "stats") ? (
      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-4">
        <StatCard label="오늘 일정" value={data.todayEventCount} unit="건" delta={data.todayEventCount === 0 ? "오늘 등록된 일정이 없습니다" : `오늘 ${data.todayEventCount}건`} icon="calendar" featured testId="stat-today" />
        <StatCard label="미확인 공지" value={data.unreadNoticeCount} unit="건" delta={`중요 ${important.length}건`} icon="ticket" testId="stat-unread" />
        <StatCard label="주의 자산" value={data.cautionAssetCount} unit="건" delta={data.cautionAssetCount === 0 ? "점검이 필요한 품목이 없습니다" : "수리·분실 상태 품목"} icon="box" iconTone="warning" testId="stat-assets" />
      </div>
      ) : null}

      {isHomeBlockVisible(home, "attention") && (data.revisionRequestedCount > 0 || (data.pendingReviewCount ?? 0) > 0) ? (
        <div className="mb-4 flex flex-col items-start gap-3 rounded-lg border border-primary/30 bg-accent/50 px-4 py-3.5 md:flex-row" data-testid="activity-attention">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon name="bell" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="accent">확인 필요</Badge>
              <b className="truncate text-sm">활동 기록 처리가 필요합니다</b>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.revisionRequestedCount > 0 ? `보완 요청된 내 기록 ${data.revisionRequestedCount}건` : null}
              {data.revisionRequestedCount > 0 && (data.pendingReviewCount ?? 0) > 0 ? " · " : null}
              {(data.pendingReviewCount ?? 0) > 0 ? `검수 대기 ${data.pendingReviewCount}건` : null}
            </p>
          </div>
          <Link href={data.revisionRequestedCount > 0 ? "/activity" : "/activity/review?status=SUBMITTED"} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary-strong hover:text-white md:w-auto">
            확인하기
          </Link>
        </div>
      ) : null}

      {(() => {
        // 운영진 홈 설정: 첫 카드는 넓은 왼쪽 열, 나머지는 오른쪽 열 (기본값은 원본 배치).
        const cards: Record<HomeCardKey, ReactNode> = {
          schedule: (
        <Card title="오늘의 일정" icon="clock" moreUrl="/calendar" moreLabel="캘린더 →" flush>
              {data.todayEvents.length === 0 ? (
                <EmptyState title="오늘 일정이 없습니다" message="캘린더에서 다음 일정을 확인해 보세요." />
              ) : (
                <div data-testid="today-events">
                  {[...data.todayEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((event) => (
                    <div key={event.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
                      <span className="min-w-11 text-sm font-extrabold text-accent-foreground">{event.isAllDay ? "종일" : timeLabel(event.startAt)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{event.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.place || "장소 미정"}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-xs font-bold text-muted-foreground">{event.teamId ? "팀" : "전체"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ),
          notices: (
        <Card title="중요·미확인 공지" icon="bell" moreUrl="/notices" moreLabel="전체 →" flush>
              {visibleNotices.length === 0 ? (
                <EmptyState title="확인할 공지가 없습니다" message="중요 공지와 미확인 공지를 모두 확인했습니다." />
              ) : (
                <div data-testid="latest-notices">
                  {visibleNotices.map((notice) => (
                    <Link key={notice.id} href={`/notices/${notice.id}`} className="flex min-h-16 items-center gap-3 border-b px-5 py-3 transition-colors last:border-b-0 hover:bg-secondary/70">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-black ${notice.important ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {notice.important ? "중요" : notice.isRead ? "확인" : "미확인"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{notice.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {notice.targetScope === "TEAM" ? notice.teamName || "팀 공지" : "전체 공지"} · {shortDate(notice.publishStartAt)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          ),
          quick: (
        <Card title="빠른 이동">
              <div className="flex flex-col gap-1">
                <Link href="/calendar" className={QUICK}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-black text-accent-foreground">{data.todayEventCount}</span>
                  <span className="min-w-0 flex-1"><b className="block text-sm">오늘 일정 확인</b><span className="text-xs text-muted-foreground">전체·팀 일정을 한곳에서 확인</span></span>
                  <span className="text-xs font-bold text-accent-foreground">보기</span>
                </Link>
                <Link href="/props" className={QUICK}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning-soft text-sm font-black text-warning">{data.cautionAssetCount}</span>
                  <span className="min-w-0 flex-1"><b className="block text-sm">주의 자산 확인</b><span className="text-xs text-muted-foreground">수리·분실 상태의 소품과 장비</span></span>
                  <span className="text-xs font-bold text-accent-foreground">보기</span>
                </Link>
                {principal.role === "ADMIN" ? (
                  <Link href="/members" className={QUICK}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-sm font-black text-info">권한</span>
                    <span className="min-w-0 flex-1"><b className="block text-sm">멤버·권한 관리</b><span className="text-xs text-muted-foreground">등록 상태와 역할 변경</span></span>
                    <span className="text-xs font-bold text-accent-foreground">보기</span>
                  </Link>
                ) : null}
              </div>
            </Card>
          ),
        };
        const [first, ...rest] = visibleHomeCards(home);
        if (!first) return null;
        return (
          <div className={`grid items-start gap-4 ${rest.length > 0 ? "lg:grid-cols-[1.7fr_1fr]" : ""}`}>
            <div className="flex flex-col gap-4">{cards[first]}</div>
            {rest.length > 0 ? <div className="flex flex-col gap-4">{rest.map((key) => <div key={key}>{cards[key]}</div>)}</div> : null}
          </div>
        );
      })()}
    </>
  );
}
