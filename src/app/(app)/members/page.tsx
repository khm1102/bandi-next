import { LiveSearch } from "@/components/bandi/live-search";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/bandi/auto-submit-select";
import { Badge, type BadgeTone } from "@/components/bandi/badge";
import { PageHead } from "@/components/bandi/page-head";
import { Pagination } from "@/components/bandi/pagination";
import { StatCard } from "@/components/bandi/stat-card";
import { DataTable } from "@/components/data-table";
import { MEMBER_STATUSES, ROLES, SSO_LINK_STATUSES, type MemberStatus, type Role } from "@/features/member/codes";
import { memberService } from "@/features/member/instance";
import { ROLE_LABEL, SSO_LABEL, STATUS_LABEL } from "@/features/member/labels";
import { requireRole } from "@/lib/session";
import { AdminForms } from "./admin-forms";

export const metadata = { title: "멤버·권한 · 반디" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const SSO_TONE: Record<string, BadgeTone> = { WAITING: "warning", LINKED: "success", REVIEW_REQUIRED: "danger" };
const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "success", PRE_REGISTERED: "info", SUSPENDED: "warning", WITHDRAWN: "neutral", REGISTRATION_CANCELLED: "neutral" };
const ROLE_TONE: Record<string, BadgeTone> = { ADMIN: "accent", LEADER: "info", MEMBER: "neutral" };

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const principal = await requireRole("ADMIN");
  const params = await searchParams;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const status = MEMBER_STATUSES.find((s) => s === one(params.status)) as MemberStatus | undefined;
  const role = ROLES.find((r) => r === one(params.role)) as Role | undefined;
  const sso = SSO_LINK_STATUSES.find((s) => s === one(params.sso));
  const keyword = one(params.q) ?? "";
  const teamId = Number(one(params.teamId)) || undefined;
  const cohortId = Number(one(params.cohortId)) || undefined;

  const service = memberService();
  const me = principal.memberId;
  const [result, activeCount, waitingCount, teams, cohorts, activeCohorts] = await Promise.all([
    service.searchMembers(me, { keyword, status, role, teamId, cohortId, ssoLinkStatus: sso, page, pageSize: 20 }),
    service.searchMembers(me, { status: "ACTIVE", pageSize: 1 }),
    service.searchMembers(me, { ssoLinkStatus: "WAITING", pageSize: 1 }),
    service.searchTeams(false),
    service.searchCohorts(false),
    service.searchCohorts(true),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const cohortName = new Map(cohorts.map((c) => [c.id, c.name]));
  const filtered = Boolean(keyword || status || role || sso || teamId || cohortId);
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (keyword) q.set("q", keyword);
    if (status) q.set("status", status);
    if (role) q.set("role", role);
    if (sso) q.set("sso", sso);
    if (teamId) q.set("teamId", String(teamId));
    if (cohortId) q.set("cohortId", String(cohortId));
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return query ? `/members?${query}` : "/members";
  };

  return (
    <>
      <PageHead title="멤버 · 권한 설정" description="운영진이 학번과 이름을 사전 등록하고 학교 SSO 연결, 단일 소속 팀과 역할을 관리합니다">
        <AdminForms teams={teams} cohorts={activeCohorts} />
      </PageHead>

      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-4">
        <StatCard label="활성 멤버" value={activeCount.total} unit="명" />
        <StatCard label="운영 중인 기수" value={activeCohorts.length} unit="개" delta={activeCohorts.map((c) => c.name).join(", ") || "없음"} />
        <StatCard label="SSO 확인 필요" value={waitingCount.total} unit="명" tone="danger" />
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-lg border bg-accent/50 px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">SSO</span>
        <div className="min-w-0">
          <b className="block text-sm">멤버 등록은 운영진 사전 등록으로만 진행합니다</b>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">운영진이 멤버를 먼저 등록하면, 멤버가 학교 계정으로 처음 로그인할 때 학번을 기준으로 계정이 연결됩니다.</p>
        </div>
      </div>

      <form action="/members" className="mb-4 rounded-lg border bg-card p-4" aria-label="멤버 검색과 필터">
        <LiveSearch className={INPUT} defaultValue={keyword} placeholder="이름 또는 학번으로 검색" aria-label="멤버 검색" />
        <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <AutoSubmitSelect className={INPUT} name="teamId" defaultValue={teamId ?? ""} aria-label="팀 필터">
            <option value="">전체 팀</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect className={INPUT} name="cohortId" defaultValue={cohortId ?? ""} aria-label="기수 필터">
            <option value="">전체 기수</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect className={INPUT} name="status" defaultValue={status ?? ""} aria-label="활동 상태 필터">
            <option value="">전체 활동 상태</option>
            {MEMBER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect className={INPUT} name="role" defaultValue={role ?? ""} aria-label="역할 필터">
            <option value="">전체 역할</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect className={INPUT} name="sso" defaultValue={sso ?? ""} aria-label="SSO 상태 필터">
            <option value="">전체 SSO 상태</option>
            {SSO_LINK_STATUSES.map((s) => <option key={s} value={s}>{SSO_LABEL[s]}</option>)}
          </AutoSubmitSelect>
        </div>
        {filtered ? <Link href="/members" className="mt-3 inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold">필터 초기화</Link> : null}
      </form>

      <div className="rounded-lg border bg-card">
        <p className="border-b px-4 py-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 권한과 관리 항목을 확인하세요.</p>
        <DataTable
          caption="멤버와 권한 목록"
          testId="member-list"
          rows={result.items}
          rowKey={(m) => m.id}
          empty={filtered ? "조건에 맞는 멤버가 없습니다" : "등록된 멤버가 없습니다"}
          columns={[
            { header: "이름", className: "min-w-40 whitespace-nowrap", cell: (m) => (
              <span className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">{m.name.slice(0, 1)}</span>
                <b>{m.name}</b>
              </span>
            ) },
            { header: "학번", className: "whitespace-nowrap", cell: (m) => m.studentNo },
            { header: "휴대폰", className: "whitespace-nowrap tabular-nums", cell: (m) => m.phoneNumber ?? "-" },
            { header: "기수", className: "whitespace-nowrap", cell: (m) => cohortName.get(m.cohortId) ?? "-" },
            { header: "소속 팀", className: "whitespace-nowrap", cell: (m) => teamName.get(m.teamId) ?? "-" },
            { header: "활동 상태", className: "whitespace-nowrap", cell: (m) => <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{STATUS_LABEL[m.status]}</Badge> },
            { header: "SSO 연결", className: "whitespace-nowrap", cell: (m) => <Badge tone={SSO_TONE[m.ssoLinkStatus] ?? "neutral"}>{SSO_LABEL[m.ssoLinkStatus] ?? m.ssoLinkStatus}</Badge> },
            { header: "역할", className: "whitespace-nowrap", cell: (m) => <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge> },
            { header: "관리", className: "text-right", cell: (m) => (
              <span className="inline-flex gap-1">
                <Link href={`/members/${m.id}`} className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-xs font-bold hover:bg-secondary">변경</Link>
                <Link href={`/members/${m.id}#history`} className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-xs font-bold hover:bg-secondary">이력</Link>
              </span>
            ) },
          ]}
        />
      </div>
      <Pagination page={page} total={result.total} pageSize={result.pageSize} label="멤버 목록 페이지" hrefFor={href} />
    </>
  );
}
