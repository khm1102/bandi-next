import { createEventAction } from "@/features/calendar/actions";
import { memberService } from "@/features/member/instance";
import { Card } from "@/components/ui";
import { requirePrincipal } from "@/lib/session";
import { forbidden } from "next/navigation";
import { EventForm } from "../event-form";

export const metadata = { title: "일정 등록 · 반디" };

export default async function NewEventPage() {
  const principal = await requirePrincipal("/calendar/new");
  if (!principal.access.canManageGlobal() && !(principal.access.leader && principal.access.active)) {
    forbidden();
  }
  const allTeams = await memberService().searchTeams();
  const teams = principal.access.canManageGlobal() ? allTeams : allTeams.filter((team) => team.id === principal.teamId);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">일정 등록</h1>
      <Card>
        <EventForm
          action={createEventAction}
          submitLabel="등록"
          teams={teams}
          allowGlobal={principal.access.canManageGlobal()}
          values={{ teamId: null, title: "", description: "", place: "", color: "NAVY", allDay: false, start: `${today}T09:00`, end: `${today}T10:00` }}
        />
      </Card>
    </>
  );
}
