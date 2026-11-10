"use client";

import FullCalendar, { type CalendarRef, type DateSelectInfo, type DatesSetInfo, type EventClickInfo, type EventDisplayInfo } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import koLocale from "@fullcalendar/react/locales/ko";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { buttonClass } from "@/components/bandi/button";
import { colorOf, EventDetailModal, formatPeriod, type CalendarEventData } from "./event-detail";

const VIEWS = [
  { key: "month", type: "dayGridMonth", label: "월" },
  { key: "week", type: "timeGridWeek", label: "주" },
  { key: "list", type: "listWeek", label: "목록" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const NAV_BTN = "flex size-11 items-center justify-center border bg-card text-lg hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring";

interface Team {
  id: number;
  name: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 로컬(한국) 시각을 일정 등록 화면의 "YYYY-MM-DDTHH:mm" 값으로 */
const localInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/**
 * 원본 schedule/calendar.js와 같은 구성: 상단 도구 막대가 FullCalendar 인스턴스를 직접 조작하고,
 * 일정은 보이는 기간만 /api/calendar-events에서 가져온다(서버가 권한을 다시 검사한다).
 */
export function CalendarClient({ teams, initialView, initialDate, initialTeamId, canWrite, manage }: {
  teams: Team[];
  initialView: ViewKey;
  initialDate: string;
  initialTeamId: number | null;
  canWrite: boolean;
  /** 일정 수정·삭제 권한: 운영진은 전체, 팀장은 자기 팀 일정 */
  manage: { global: boolean; teamId: number | null };
}) {
  const router = useRouter();
  const calendar = useRef<CalendarRef>(null);
  const teamRef = useRef<number | null>(initialTeamId);
  const [teamId, setTeamId] = useState<number | null>(initialTeamId);
  const [view, setView] = useState<ViewKey>(initialView);
  const [title, setTitle] = useState("기간을 불러오는 중");
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEventData | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const teamName = useCallback((id: number | null) => (id === null ? "전체" : (teams.find((t) => t.id === id)?.name ?? "팀")), [teams]);
  const canManage = (event: CalendarEventData) => (event.teamId === null ? manage.global : manage.global || manage.teamId === event.teamId);
  const api = () => calendar.current?.getApi();

  /** 보기·날짜·팀을 주소에 남겨 새로고침·공유해도 같은 화면이 열리게 한다. */
  const syncUrl = (nextView: ViewKey, date: Date, nextTeam: number | null) => {
    const q = new URLSearchParams({ view: nextView, date: localInput(date).slice(0, 10) });
    if (nextTeam) q.set("team", String(nextTeam));
    window.history.replaceState(null, "", `/calendar?${q.toString()}`);
  };

  const fetchEvents = useCallback(
    async (info: { start: Date; end: Date }, success: (events: object[]) => void, fail: (error: Error) => void) => {
      const q = new URLSearchParams({ start: info.start.toISOString(), end: info.end.toISOString() });
      if (teamRef.current) q.set("teamId", String(teamRef.current));
      try {
        const response = await fetch(`/api/calendar-events?${q.toString()}`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const events = (await response.json()) as CalendarEventData[];
        setFailure(null);
        success(
          events.map((e) => ({
            id: String(e.id),
            title: e.title,
            start: e.startAt,
            end: e.endAt,
            allDay: e.isAllDay,
            color: colorOf(e.color).hex,
            textColor: "#ffffff",
            extendedProps: { raw: e },
          })),
        );
      } catch (error) {
        setFailure("일정을 불러오지 못했어요. 입력한 필터는 유지했어요.");
        fail(error instanceof Error ? error : new Error("fetch failed"));
      }
    },
    [],
  );

  const renderEvent = (info: EventDisplayInfo) => {
    const raw = info.event.extendedProps.raw as CalendarEventData;
    return (
      <div className="bandi-calendar-event-content">
        <span className="bandi-calendar-event-team">{teamName(raw.teamId)}</span>
        <span className="bandi-calendar-event-title">{raw.title}</span>
        {info.view.type === "listWeek" && raw.place ? <span className="bandi-calendar-event-place">· {raw.place}</span> : null}
      </div>
    );
  };

  const mountEvent = (info: EventDisplayInfo & { el: HTMLElement }) => {
    const raw = info.event.extendedProps.raw as CalendarEventData;
    info.el.setAttribute("aria-label", `${raw.title}, ${teamName(raw.teamId)}, ${formatPeriod(raw)}`);
    info.el.setAttribute("role", "button");
    info.el.tabIndex = 0;
    info.el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelected(raw);
      }
    });
  };

  /** 관리 권한이 있으면 날짜를 누르거나 드래그해 그 시간으로 채운 일정 등록 화면을 연다. */
  const openCreate = (start: Date, end: Date, allDay: boolean) => {
    const q = new URLSearchParams({ start: localInput(start), end: localInput(end) });
    if (allDay) q.set("allDay", "1");
    router.push(`/calendar/new?${q.toString()}`);
  };

  const onDatesSet = (info: DatesSetInfo) => {
    const key = VIEWS.find((v) => v.type === info.view.type)?.key ?? "month";
    const viewTitle = info.view.title;
    // FullCalendar가 첫 렌더 도중에도 이 콜백을 부르므로 상태 갱신은 렌더가 끝난 뒤로 미룬다.
    queueMicrotask(() => {
      setTitle(viewTitle);
      setView(key);
      setAnnouncement(`${viewTitle} 일정을 표시합니다.`);
      syncUrl(key, api()?.getDate() ?? new Date(), teamRef.current);
    });
  };

  const changeTeam = (value: string) => {
    const next = Number(value) || null;
    teamRef.current = next;
    setTeamId(next);
    syncUrl(view, api()?.getDate() ?? new Date(), next);
    api()?.refetchEvents();
  };

  const initialType = VIEWS.find((v) => v.key === initialView)?.type ?? "dayGridMonth";

  return (
    <>
      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="calendarPeriodTitle">
        <div className="border-b px-4 py-4 md:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button type="button" onClick={() => api()?.today()} className="min-h-11 rounded-md border bg-card px-3 text-sm font-bold hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">오늘</button>
              <div className="flex" aria-label="기간 이동">
                <button type="button" onClick={() => api()?.prev()} className={`${NAV_BTN} rounded-l-md`} aria-label="이전 기간">‹</button>
                <button type="button" onClick={() => api()?.next()} className={`${NAV_BTN} rounded-r-md border-l-0`} aria-label="다음 기간">›</button>
              </div>
              <h2 id="calendarPeriodTitle" className="order-3 w-full truncate text-lg font-black tracking-tight md:order-none md:w-auto md:flex-1" data-testid="calendar-month">{title}</h2>
            </div>
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-end lg:justify-end">
              <div className="flex rounded-md border bg-secondary p-1" role="group" aria-label="캘린더 보기">
                {VIEWS.map((item) => (
                  <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => api()?.changeView(item.type)} className={`min-h-11 min-w-11 rounded-sm px-3 text-sm font-bold ${view === item.key ? "bg-card" : "text-muted-foreground"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="min-w-52">
                <label className="sr-only" htmlFor="calendarTeamFilter">표시할 팀</label>
                <select id="calendarTeamFilter" value={teamId ?? ""} onChange={(e) => changeTeam(e.target.value)} className={INPUT}>
                  <option value="">전체 일정</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              {canWrite ? <Link href="/calendar/new" className={buttonClass("primary")}>일정 등록</Link> : null}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {teamId ? `${teamName(teamId)} 일정과 동아리 전체 일정을 함께 보여드려요.` : "팀을 선택하면 해당 팀 일정과 동아리 전체 일정을 함께 보여드려요."}
          </p>
        </div>

        {failure ? (
          <div className="flex flex-wrap items-center gap-3 border-b bg-secondary px-4 py-3" role="status">
            <div className="min-w-0 flex-1">
              <b className="block text-sm">일정을 불러오지 못했어요</b>
              <p className="mt-1 text-xs text-muted-foreground">{failure}</p>
            </div>
            <button type="button" className="min-h-11 rounded-md border bg-card px-4 text-sm font-bold hover:bg-background" onClick={() => api()?.refetchEvents()}>다시 시도</button>
          </div>
        ) : null}

        <div className="p-3 md:p-5" data-calendar-shell data-testid="calendar-list">
          <FullCalendar
            ref={calendar}
            plugins={[classicThemePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locale={koLocale}
            initialView={initialType}
            initialDate={initialDate}
            headerToolbar={false}
            height="auto"
            dayMaxEvents={3}
            nowIndicator
            selectable={canWrite}
            selectMirror
            editable={false}
            allDaySlot
            slotMinTime="07:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:30:00"
            events={fetchEvents}
            eventContent={renderEvent}
            eventDidMount={mountEvent}
            eventClick={(info: EventClickInfo) => {
              info.jsEvent.preventDefault();
              setSelected(info.event.extendedProps.raw as CalendarEventData);
            }}
            select={(info: DateSelectInfo) => openCreate(info.start, info.end, info.allDay)}
            datesSet={onDatesSet}
            moreLinkContent={(arg) => `${arg.num}개 더 보기`}
            noEventsContent="이 기간에는 일정이 없어요."
          />
        </div>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </section>
      <EventDetailModal event={selected} teamName={teamName} canManage={selected ? canManage(selected) : false} onClose={() => setSelected(null)} />
    </>
  );
}
