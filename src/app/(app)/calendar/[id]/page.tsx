import { forbidden, notFound } from "next/navigation";
import { Button } from "@/components/bandi/button";
import { PageHead } from "@/components/bandi/page-head";
import { deleteEventAction, updateEventAction } from "@/features/calendar/actions";
import { calendarService } from "@/features/calendar/instance";
import { memberService } from "@/features/member/instance";
import { toKstDateTimeInput } from "@/lib/kst";
import { guard } from "@/lib/page-errors";
import { requirePrincipal } from "@/lib/session";
import { EventForm } from "../event-form";
import { DeleteEventForm } from "./delete-form";

export const metadata = { title: "일정 수정 · 반디" };

export default async function EditEventPage({ params }: PageProps<"/calendar/[id]">) {
  const principal = await requirePrincipal("/calendar");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const event = await guard(calendarService().lookup(principal.memberId, id));
  const manageable = event.teamId === null ? principal.access.canManageGlobal() : principal.access.canManageTeam(event.teamId);
  if (!manageable) forbidden();
  const allTeams = await memberService().searchTeams();
  const teams = principal.access.canManageGlobal() ? allTeams : allTeams.filter((t) => t.id === principal.teamId);
  // 종일 일정의 종료는 배타적(다음 날 00:00)이므로 화면에는 마지막 날을 보여준다.
  const endForForm = event.isAllDay ? new Date(event.endAt.getTime() - 24 * 60 * 60 * 1000) : event.endAt;
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead title="일정 수정" description="일정 범위와 시간을 확인한 뒤 저장하세요.">
          <Button variant="outline" href="/calendar">캘린더</Button>
        </PageHead>
      </div>
      <EventForm
        action={updateEventAction}
        submitLabel="저장"
        teams={teams}
        allowGlobal={principal.access.canManageGlobal()}
        values={{
          eventId: event.id,
          teamId: event.teamId,
          title: event.title,
          description: event.description ?? "",
          place: event.place ?? "",
          color: event.color,
          allDay: event.isAllDay,
          start: toKstDateTimeInput(event.startAt),
          end: toKstDateTimeInput(endForForm),
        }}
      />

      <div className="mx-auto mt-2 flex max-w-5xl justify-start border-t pt-5">
        <DeleteEventForm action={deleteEventAction} eventId={event.id} />
      </div>
    </>
  );
}
