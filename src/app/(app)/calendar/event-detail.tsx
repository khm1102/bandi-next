"use client";

import Link from "next/link";
import { Badge } from "@/components/bandi/badge";
import { buttonClass } from "@/components/bandi/button";
import { Modal } from "@/components/bandi/modal";
import { deleteEventAction } from "@/features/calendar/actions";
import { DeleteEventForm } from "./[id]/delete-form";

/** /api/calendar-events 응답 형태 */
export interface CalendarEventData {
  id: number;
  teamId: number | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  place: string | null;
  color: string;
  updatedAt: string;
}

// 원본 bandi-adapter.css의 이벤트 색.
export const EVENT_COLORS: Record<string, { hex: string; label: string }> = {
  NAVY: { hex: "#0b1f33", label: "네이비" },
  MINT: { hex: "#6f0011", label: "민트" },
  BLUE: { hex: "#315f8f", label: "파랑" },
  PLUM: { hex: "#704983", label: "보라" },
  AMBER: { hex: "#80530a", label: "주황" },
  ROSE: { hex: "#a63c4d", label: "장미" },
};
export const colorOf = (code: string) => EVENT_COLORS[code] ?? EVENT_COLORS.NAVY;

const DAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const DAY_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** 원본 formatPeriod: 종일 일정의 종료는 배타적이므로 마지막 날을 보여준다. */
export function formatPeriod(event: CalendarEventData): string {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (event.isAllDay) {
    const lastDay = new Date(end.getTime() - 24 * 3600_000);
    return DAY.format(start) === DAY.format(lastDay) ? DAY.format(start) : `${DAY.format(start)} ~ ${DAY.format(lastDay)}`;
  }
  return `${DAY_TIME.format(start)} ~ ${DAY_TIME.format(end)}`;
}

const ROW = "grid gap-1 py-4 md:grid-cols-4 md:gap-4";

/** 원본 calendar.jsp의 "일정 상세" 모달. 수정·삭제는 관리 권한이 있을 때만 보이고, 서버가 다시 검사한다. */
export function EventDetailModal({ event, teamName, canManage, onClose }: { event: CalendarEventData | null; teamName: (teamId: number | null) => string; canManage: boolean; onClose: () => void }) {
  if (!event) return null;
  const color = colorOf(event.color);
  const scope = event.teamId === null ? "전체 일정" : `${teamName(event.teamId)} 일정`;
  return (
    <Modal
      open
      onClose={onClose}
      title="일정 상세"
      size="lg"
      mobileFullscreen
      footer={
        <>
          {canManage ? <div className="mr-auto"><DeleteEventForm action={deleteEventAction} eventId={event.id} /></div> : null}
          <button type="button" className={buttonClass("outline")} onClick={onClose}>닫기</button>
          {canManage ? <Link href={`/calendar/${event.id}`} className={buttonClass("primary")}>일정 수정</Link> : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{scope}</Badge>
        <Badge tone="accent">{event.isAllDay ? "종일 일정" : "시간 일정"}</Badge>
      </div>
      <h3 className="mt-5 text-xl font-black tracking-tight">{event.title}</h3>
      <dl className="mt-6 divide-y border-y">
        <div className={ROW}><dt className="text-sm font-bold text-muted-foreground">일시</dt><dd className="text-sm font-semibold md:col-span-3">{formatPeriod(event)}</dd></div>
        <div className={ROW}><dt className="text-sm font-bold text-muted-foreground">장소</dt><dd className="text-sm md:col-span-3">{event.place || "미정"}</dd></div>
        <div className={ROW}><dt className="text-sm font-bold text-muted-foreground">표시 색상</dt><dd className="flex items-center gap-2 text-sm md:col-span-3"><span className="size-3 rounded-full" style={{ backgroundColor: color.hex }} />{color.label}</dd></div>
        <div className={ROW}><dt className="text-sm font-bold text-muted-foreground">설명</dt><dd className="whitespace-pre-wrap text-sm leading-6 md:col-span-3">{event.description || "설명이 없습니다."}</dd></div>
        <div className={ROW}><dt className="text-sm font-bold text-muted-foreground">마지막 수정</dt><dd className="text-sm md:col-span-3">{DAY_TIME.format(new Date(event.updatedAt))}</dd></div>
      </dl>
    </Modal>
  );
}
