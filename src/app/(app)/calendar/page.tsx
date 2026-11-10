import { PageHead } from "@/components/bandi/page-head";
import { memberService } from "@/features/member/instance";
import { parseKst, toKstDate } from "@/lib/kst";
import { requirePrincipal } from "@/lib/session";
import { CalendarClient } from "./calendar-client";

export const metadata = { title: "통합 캘린더 · 반디" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** 통합 캘린더 (원본 schedule/calendar.jsp): 달력 본문은 FullCalendar, 일정은 보이는 기간만 API로 가져온다. */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const principal = await requirePrincipal("/calendar");
  const params = await searchParams;
  const rawDate = one(params.date);
  const date = rawDate && !Number.isNaN(parseKst(rawDate).getTime()) ? rawDate : toKstDate(new Date());
  const viewParam = one(params.view);
  const view = viewParam === "week" || viewParam === "list" ? viewParam : "month";
  const teams = await memberService().searchTeams();
  const teamParam = Number(one(params.team)) || null;
  const teamId = teams.some((t) => t.id === teamParam) ? teamParam : null;
  const canWrite = principal.access.canManageGlobal() || principal.access.leader;
  return (
    <>
      <PageHead title="통합 캘린더" description="동아리 전체 일정과 팀 일정을 한곳에서 확인하세요." />
      <CalendarClient
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        initialView={view}
        initialDate={date}
        initialTeamId={teamId}
        canWrite={canWrite}
        manage={{ global: principal.access.canManageGlobal(), teamId: principal.access.leader && principal.access.active ? principal.teamId : null }}
      />
    </>
  );
}
