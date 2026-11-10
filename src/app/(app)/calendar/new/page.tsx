import { createEventAction } from "@/features/calendar/actions";
import { memberService } from "@/features/member/instance";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { parseKst, toKstDate } from "@/lib/kst";
import { requirePrincipal } from "@/lib/session";
import { forbidden } from "next/navigation";
import { EventForm } from "../event-form";

export const metadata = { title: "일정 등록 · 반디" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function NewEventPage({ searchParams }: PageProps<"/calendar/new">) {
  const principal = await requirePrincipal("/calendar/new");
  if (!principal.access.canManageGlobal() && !(principal.access.leader && principal.access.active)) {
    forbidden();
  }
  const allTeams = await memberService().searchTeams();
  const teams = principal.access.canManageGlobal() ? allTeams : allTeams.filter((team) => team.id === principal.teamId);
  // 캘린더에서 날짜를 눌러 들어오면 그 시간으로 채운다 (형식이 맞지 않으면 무시).
  const params = await searchParams;
  const today = toKstDate(new Date());
  const startParam = one(params.start);
  const endParam = one(params.end);
  const allDay = one(params.allDay) === "1";
  const start = startParam && LOCAL.test(startParam) ? startParam : `${today}T09:00`;
  let end = endParam && LOCAL.test(endParam) ? endParam : `${today}T10:00`;
  // 종일 선택의 끝은 배타적(다음 날 00:00)이므로 화면에는 마지막 날을 보여준다.
  if (allDay && endParam && LOCAL.test(endParam)) {
    end = `${toKstDate(new Date(parseKst(endParam.slice(0, 10)).getTime() - 24 * 3600_000))}T00:00`;
  }
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="일정 등록" description="일정 범위와 시간을 확인한 뒤 저장하세요.">
          <Button variant="outline" href="/calendar">캘린더</Button>
        </PageHead>
      </div>
      <EventForm
        action={createEventAction}
        submitLabel="등록"
        teams={teams}
        allowGlobal={principal.access.canManageGlobal()}
        values={{ teamId: null, title: "", description: "", place: "", color: "NAVY", allDay, start, end }}
      />

    </>
  );
}
