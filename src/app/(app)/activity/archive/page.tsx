import Link from "next/link";
import { Card } from "@/components/ui";
import { activityService } from "@/features/activity/instance";
import { memberService } from "@/features/member/instance";
import { formatDateTime } from "@/lib/format";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "활동 기록 보관함 · 반디" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ArchivePage({ searchParams }: PageProps<"/activity/archive">) {
  const principal = await requirePrincipal("/activity/archive");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;
  const [result, teams] = await Promise.all([
    activityService().searchArchive(principal.memberId, { keyword, teamId, page }),
    memberService().searchTeams(),
  ]);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">활동 기록 보관함</h1>
      <p className="text-sm text-muted-foreground">최종 승인된 활동 기록입니다.</p>
      <form action="/activity/archive" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={keyword} placeholder="제목·작성자" className="rounded-md border border-input bg-card px-3 py-2" />
        <select name="teamId" defaultValue={teamId ?? ""} aria-label="팀" className="rounded-md border border-input bg-card px-3 py-2">
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
      </form>
      <Card>
        <ul className="divide-y divide-border" data-testid="archive-list">
          {result.items.length === 0 ? <li className="py-3 text-sm text-muted-foreground">최종 승인된 기록이 없습니다.</li> : null}
          {result.items.map((a) => (
            <li key={a.id} className="py-3">
              <Link href={`/activity/archive/${a.id}`} className="block">
                <span className="font-bold">{a.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {a.teamName} · {a.authorName} · {formatDateTime(a.activityAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
