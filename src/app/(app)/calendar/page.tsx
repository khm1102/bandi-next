import Link from "next/link";
import { calendarService } from "@/features/calendar/instance";
import { memberService } from "@/features/member/instance";
import { eventDays, monthGrid, monthRange, parseMonth, shiftMonth, toKstDate, toKstTime } from "@/lib/kst";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "캘린더 · 반디" };

const COLOR_CLASS: Record<string, string> = {
  NAVY: "bg-slate-800 text-white",
  MINT: "bg-emerald-200 text-emerald-900",
  BLUE: "bg-blue-200 text-blue-900",
  PLUM: "bg-accent text-accent-foreground",
  AMBER: "bg-amber-200 text-amber-900",
  ROSE: "bg-rose-200 text-rose-900",
};
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const principal = await requirePrincipal("/calendar");
  const params = await searchParams;
  const { year, month } = parseMonth(one(params.month), new Date());
  const teamId = Number(one(params.team)) || undefined;
  const { start, end } = monthRange(year, month);
  const [events, teams] = await Promise.all([
    calendarService().search(principal.memberId, { rangeStart: start, rangeEnd: end, teamId }),
    memberService().searchTeams(),
  ]);
  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    for (const day of eventDays(event.startAt, event.endAt)) {
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }
  }
  const todayKst = toKstDate(new Date());
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const href = (y: number, m: number) =>
    `/calendar?month=${y}-${String(m).padStart(2, "0")}${teamId ? `&team=${teamId}` : ""}`;
  const canWrite = principal.access.canManageGlobal() || principal.access.leader;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">캘린더</h1>
        {canWrite ? (
          <Link href="/calendar/new" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
            일정 등록
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={href(prev.year, prev.month)} aria-label="이전 달" className="inline-flex size-11 items-center justify-center rounded-md border bg-card hover:bg-secondary">
          ◀
        </Link>
        <strong data-testid="calendar-month">
          {year}년 {month}월
        </strong>
        <Link href={href(next.year, next.month)} aria-label="다음 달" className="inline-flex size-11 items-center justify-center rounded-md border bg-card hover:bg-secondary">
          ▶
        </Link>
        <form action="/calendar" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="month" value={`${year}-${String(month).padStart(2, "0")}`} />
          <select name="team" defaultValue={teamId ?? ""} aria-label="팀 필터" className="rounded-lg border border-input px-2 py-1.5">
            <option value="">전체 팀</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">적용</button>
        </form>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
        {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
          <div key={d} className={`bg-secondary px-2 py-1.5 text-center font-bold ${i === 0 ? "text-destructive" : i === 6 ? "text-info" : "text-muted-foreground"}`}>
            {d}
          </div>
        ))}
        {monthGrid(year, month).map((cell) => (
          <div key={cell.date} className={`min-h-20 bg-card p-1 ${cell.inMonth ? "" : "opacity-40"}`} aria-current={cell.date === todayKst ? "date" : undefined}>
            <p className={`mb-0.5 inline-flex size-6 items-center justify-center rounded-full px-1 font-semibold ${cell.date === todayKst ? "bg-primary text-primary-foreground" : ""}`}>
              {Number(cell.date.slice(8))}
            </p>
            <ul className="space-y-0.5">
              {(byDay.get(cell.date) ?? []).slice(0, 3).map((event) => (
                <li key={event.id}>
                  <Link
                    href={canWrite ? `/calendar/${event.id}` : "#"}
                    className={`block truncate rounded px-1 py-0.5 ${COLOR_CLASS[event.color] ?? COLOR_CLASS.NAVY}`}
                    title={event.title}
                  >
                    {event.isAllDay ? "" : `${toKstTime(event.startAt)} `}
                    {event.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul className="space-y-2 text-sm" data-testid="calendar-list">
        {events.length === 0 ? <li className="text-muted-foreground">이 달에는 일정이 없습니다.</li> : null}
        {events.map((event) => (
          <li key={event.id} className="rounded-lg border bg-card px-3 py-2">
            <strong>{event.title}</strong>
            <span className="ml-2 text-muted-foreground">
              {teams.find((t) => t.id === event.teamId)?.name ?? "동아리 전체"}
              {event.place ? ` · ${event.place}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
