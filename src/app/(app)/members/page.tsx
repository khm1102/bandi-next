import Link from "next/link";
import { Card } from "@/components/ui";
import { MEMBER_STATUSES, ROLES, type MemberStatus, type Role } from "@/features/member/codes";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL, STATUS_LABEL } from "@/features/member/labels";
import { requireRole } from "@/lib/session";
import { AdminForms } from "./admin-forms";

export const metadata = { title: "멤버 관리 · 반디" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const principal = await requireRole("ADMIN");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = MEMBER_STATUSES.find((s) => s === one(params.status)) as MemberStatus | undefined;
  const role = ROLES.find((r) => r === one(params.role)) as Role | undefined;
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;

  const service = memberService();
  const [result, teams, cohorts] = await Promise.all([
    service.searchMembers(principal.memberId, { keyword, status, role, teamId, page, pageSize: 20 }),
    service.searchTeams(false),
    service.searchCohorts(false),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const qs = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (status) q.set("status", status);
    if (role) q.set("role", role);
    if (teamId) q.set("teamId", String(teamId));
    q.set("page", String(p));
    return `/members?${q.toString()}`;
  };

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">멤버 관리</h1>
      <AdminForms teams={teams} cohorts={cohorts} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2 text-sm" action="/members">
          <input name="q" defaultValue={keyword} placeholder="이름·학번" className="rounded-md border border-input bg-card px-3 py-2" />
          <select name="status" defaultValue={status ?? ""} className="rounded-md border border-input bg-card px-3 py-2">
            <option value="">전체 상태</option>
            {MEMBER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select name="role" defaultValue={role ?? ""} className="rounded-md border border-input bg-card px-3 py-2">
            <option value="">전체 권한</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary-strong">검색</button>
        </form>
        <p className="mb-2 text-sm text-muted-foreground">총 {result.total}명</p>
        <ul className="divide-y divide-border" data-testid="member-list">
          {result.items.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                <strong>{m.name}</strong> · {m.studentNo} · {teamName.get(m.teamId) ?? "-"} · {ROLE_LABEL[m.role]} ·{" "}
                {STATUS_LABEL[m.status]}
              </span>
              <Link href={`/members/${m.id}`} className="font-semibold underline">
                관리
              </Link>
            </li>
          ))}
        </ul>
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? <Link href={qs(page - 1)}>이전</Link> : null}
          <span>
            {page} / {lastPage}
          </span>
          {page < lastPage ? <Link href={qs(page + 1)}>다음</Link> : null}
        </nav>
      </Card>
    </>
  );
}
