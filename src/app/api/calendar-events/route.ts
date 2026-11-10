import { calendarService } from "@/features/calendar/instance";
import { InvalidInputError } from "@/features/member/errors";
import { apiRoute, positiveId } from "@/lib/http";

const MAX_RANGE_MS = 62 * 24 * 3600_000;

/**
 * 캘린더 화면(FullCalendar)이 보이는 기간의 일정을 가져간다. 로그인 멤버만, 서비스가 권한을 다시 검사한다.
 * 기간은 최대 62일로 제한한다 (월 보기 6주 + 여유).
 */
export const GET = apiRoute(async (request, principal) => {
  const q = new URL(request.url).searchParams;
  const start = new Date(q.get("start") ?? "");
  const end = new Date(q.get("end") ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new InvalidInputError();
  }
  const rawTeam = q.get("teamId");
  const teamId = rawTeam ? positiveId(rawTeam) : null;
  if (rawTeam && teamId === null) throw new InvalidInputError();
  const events = await calendarService().search(principal.memberId, { rangeStart: start, rangeEnd: end, teamId: teamId ?? undefined });
  return Response.json(
    events.map((e) => ({
      id: e.id,
      teamId: e.teamId,
      title: e.title,
      description: e.description,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      isAllDay: e.isAllDay,
      place: e.place,
      color: e.color,
      updatedAt: e.updatedAt.toISOString(),
    })),
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
