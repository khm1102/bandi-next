import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { auditLog } from "@/features/audit/schema";
import { cohort, member, memberChangeHistory } from "@/features/member/schema";
import { createMemberService } from "@/features/member/service";

let db: NodePgDatabase;
const clock = new Date("2026-11-07T00:00:00Z");
const revoked: number[] = [];
const svc = () => createMemberService({ db, now: () => clock, revokeSessions: async (id) => void revoked.push(id) });
let cohortId: number;

async function add(studentNo: string, name: string, role: string, teamId: number, status = "ACTIVE") {
  const [row] = await db
    .insert(member)
    .values({ studentNo, name, role, teamId, cohortId, status, ssoLinkStatus: "LINKED", phoneNumber: "01012345678" })
    .returning({ id: member.id });
  return row.id;
}

let admin: number, admin2: number, leaderA: number, memberA: number, memberB: number;

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  revoked.length = 0;
  await resetData(db);
  const [c] = await db.insert(cohort).values({ name: "1-1" }).returning();
  cohortId = c.id;
  admin = await add("1", "관리자1", "ADMIN", 3);
  admin2 = await add("2", "관리자2", "ADMIN", 3);
  leaderA = await add("3", "팀장A", "LEADER", 3);
  await add("4", "팀장B", "LEADER", 4);
  memberA = await add("5", "멤버A", "MEMBER", 3);
  memberB = await add("6", "멤버B", "MEMBER", 4);
});

describe("사전 등록·기수", () => {
  it("ADMIN은 학번·이름·팀·기수로 사전 등록한다 (PRE_REGISTERED/WAITING)", async () => {
    const id = await svc().preRegister(admin, { studentNo: "2026000001", name: "신입", teamId: 3, cohortId });
    const [row] = await db.select().from(member).where(eq(member.id, id));
    expect(row).toMatchObject({ status: "PRE_REGISTERED", ssoLinkStatus: "WAITING", role: "MEMBER", registeredByMemberId: admin });
  });

  it("중복 학번·비ADMIN·잘못된 팀·기수는 거부한다", async () => {
    await expect(svc().preRegister(admin, { studentNo: "5", name: "x", teamId: 3, cohortId })).rejects.toMatchObject({ code: "DUPLICATE_STUDENT_NO" });
    await expect(svc().preRegister(leaderA, { studentNo: "9", name: "x", teamId: 3, cohortId })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
    await expect(svc().preRegister(admin, { studentNo: "9", name: "x", teamId: 999, cohortId })).rejects.toMatchObject({ code: "INVALID_TEAM" });
    await expect(svc().preRegister(admin, { studentNo: "9", name: "x", teamId: 3, cohortId: 999 })).rejects.toMatchObject({ code: "INVALID_COHORT" });
    await expect(svc().preRegister(admin, { studentNo: "abc", name: "x", teamId: 3, cohortId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("기수는 ADMIN만 추가하고 중복 이름은 거부한다", async () => {
    await expect(svc().createCohort(admin, "1-2")).resolves.toMatchObject({ name: "1-2" });
    await expect(svc().createCohort(admin, "1-2")).rejects.toMatchObject({ code: "DUPLICATE_COHORT" });
    await expect(svc().createCohort(leaderA, "1-3")).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });
});

describe("팀 변경", () => {
  it("본인은 사유와 함께 즉시 팀을 바꾸고 이력·감사가 남는다", async () => {
    await svc().changeTeam(memberA, { memberId: memberA, newTeamId: 4, reason: "이동" });
    const [row] = await db.select().from(member).where(eq(member.id, memberA));
    expect(row.teamId).toBe(4);
    const [history] = await db.select().from(memberChangeHistory);
    expect(history).toMatchObject({ field: "TEAM", oldValue: "3", newValue: "4", reason: "이동", changedByMemberId: memberA });
    expect((await db.select().from(auditLog))[0]).toMatchObject({ action: "MEMBER_TEAM_CHANGED", targetId: memberA });
  });

  it("팀장은 현재 자기 팀 멤버만, 다른 팀 멤버는 변경할 수 없다", async () => {
    await expect(svc().changeTeam(leaderA, { memberId: memberA, newTeamId: 4, reason: "r" })).resolves.toBeUndefined();
    await expect(svc().changeTeam(leaderA, { memberId: memberB, newTeamId: 3, reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });

  it("일반 멤버는 타인의 팀을 바꿀 수 없다", async () => {
    await expect(svc().changeTeam(memberA, { memberId: memberB, newTeamId: 3, reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });

  it("사유 누락·동일 팀·비활성 팀은 거부하고 아무것도 기록하지 않는다", async () => {
    await expect(svc().changeTeam(memberA, { memberId: memberA, newTeamId: 4, reason: " " })).rejects.toMatchObject({ code: "CHANGE_REASON_REQUIRED" });
    await expect(svc().changeTeam(memberA, { memberId: memberA, newTeamId: 3, reason: "r" })).rejects.toMatchObject({ code: "NO_CHANGE" });
    await expect(svc().changeTeam(memberA, { memberId: memberA, newTeamId: 999, reason: "r" })).rejects.toMatchObject({ code: "INVALID_TEAM" });
    expect(await db.select().from(memberChangeHistory)).toHaveLength(0);
  });

  it("비활성(정지) 멤버는 본인 팀도 바꿀 수 없다", async () => {
    const suspended = await add("7", "정지", "MEMBER", 3, "SUSPENDED");
    await expect(svc().changeTeam(suspended, { memberId: suspended, newTeamId: 4, reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });
});

describe("기수 변경", () => {
  it("ADMIN과 대상의 팀 LEADER만 변경할 수 있다", async () => {
    const [c2] = await db.insert(cohort).values({ name: "1-2" }).returning();
    await svc().changeCohort(leaderA, { memberId: memberA, newCohortId: c2.id, reason: "r" });
    await expect(svc().changeCohort(leaderA, { memberId: memberB, newCohortId: c2.id, reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
    await expect(svc().changeCohort(memberA, { memberId: memberA, newCohortId: cohortId, reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
    await svc().changeCohort(admin, { memberId: memberB, newCohortId: c2.id, reason: "r" });
  });
});

describe("권한(역할) 변경", () => {
  it("ADMIN만 변경하고, 변경 후 대상 세션을 폐기한다", async () => {
    await svc().changeRole(admin, { memberId: memberA, newRole: "LEADER", reason: "승격" });
    expect((await db.select().from(member).where(eq(member.id, memberA)))[0].role).toBe("LEADER");
    expect(revoked).toEqual([memberA]);
    await expect(svc().changeRole(leaderA, { memberId: memberB, newRole: "ADMIN", reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
    await expect(svc().changeRole(memberA, { memberId: memberA, newRole: "ADMIN", reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });

  it("본인의 ADMIN 권한은 직접 내릴 수 없지만 다른 ADMIN이 내릴 수 있다", async () => {
    await expect(svc().changeRole(admin, { memberId: admin, newRole: "MEMBER", reason: "r" })).rejects.toMatchObject({ code: "SELF_ROLE_DEMOTION" });
    await svc().changeRole(admin2, { memberId: admin, newRole: "MEMBER", reason: "r" });
  });

  it("마지막 활성 ADMIN은 강등할 수 없다", async () => {
    await svc().changeRole(admin, { memberId: admin2, newRole: "MEMBER", reason: "r" });
    await expect(svc().changeRole(admin2, { memberId: admin, newRole: "MEMBER", reason: "r" })).rejects.toBeDefined();
    await expect(svc().changeRole(admin, { memberId: admin, newRole: "MEMBER", reason: "r" })).rejects.toBeDefined();
    expect((await db.select().from(member).where(eq(member.id, admin)))[0].role).toBe("ADMIN");
  });
});

describe("상태 변경", () => {
  it("ACTIVE → SUSPENDED → ACTIVE 와 WITHDRAWN 복구는 ADMIN이 사유와 함께 처리한다", async () => {
    await svc().changeStatus(admin, { memberId: memberA, newStatus: "SUSPENDED", reason: "r" });
    await svc().changeStatus(admin, { memberId: memberA, newStatus: "WITHDRAWN", reason: "r" });
    await svc().changeStatus(admin, { memberId: memberA, newStatus: "ACTIVE", reason: "복구" });
    expect((await db.select().from(memberChangeHistory)).filter((h) => h.field === "STATUS")).toHaveLength(3);
    expect(revoked.filter((id) => id === memberA)).toHaveLength(3);
  });

  it("REGISTRATION_CANCELLED는 복구할 수 없고, 마지막 ADMIN은 비활성화할 수 없다", async () => {
    const pre = await add("8", "사전", "MEMBER", 3, "PRE_REGISTERED");
    await svc().changeStatus(admin, { memberId: pre, newStatus: "REGISTRATION_CANCELLED", reason: "r" });
    await expect(svc().changeStatus(admin, { memberId: pre, newStatus: "ACTIVE", reason: "r" })).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await svc().changeStatus(admin, { memberId: admin2, newStatus: "SUSPENDED", reason: "r" });
    await expect(svc().changeStatus(admin, { memberId: admin, newStatus: "SUSPENDED", reason: "r" })).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMIN" });
  });

  it("ADMIN이 아니면 거부한다", async () => {
    await expect(svc().changeStatus(leaderA, { memberId: memberA, newStatus: "SUSPENDED", reason: "r" })).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });
});

describe("조회", () => {
  it("전체 멤버 목록은 ADMIN만, 팀·상태·키워드 필터와 페이지네이션을 지원한다", async () => {
    const all = await svc().searchMembers(admin, {});
    expect(all.total).toBe(6);
    expect((await svc().searchMembers(admin, { teamId: 4 })).total).toBe(2);
    expect((await svc().searchMembers(admin, { keyword: "팀장" })).items.map((m) => m.name).sort()).toEqual(["팀장A", "팀장B"]);
    expect((await svc().searchMembers(admin, { pageSize: 2, page: 2 })).items).toHaveLength(2);
    await expect(svc().searchMembers(leaderA, {})).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });

  it("키워드의 LIKE 특수문자는 이스케이프된다", async () => {
    expect((await svc().searchMembers(admin, { keyword: "%" })).total).toBe(0);
  });

  it("팀장 목록은 자기 팀의 활성 멤버만 보여준다", async () => {
    const names = (await svc().searchTeamMembers(leaderA)).map((m) => m.name).sort();
    expect(names).toEqual(["관리자1", "관리자2", "멤버A", "팀장A"]);
    await expect(svc().searchTeamMembers(memberA)).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
    await expect(svc().searchTeamMembers(admin)).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });

  it("이력 조회는 해당 팀 관리자·ADMIN만 가능하다", async () => {
    await svc().changeTeam(memberA, { memberId: memberA, newTeamId: 4, reason: "r" });
    expect(await svc().searchHistories(admin, memberA)).toHaveLength(1);
    await expect(svc().searchHistories(memberB, memberA)).rejects.toMatchObject({ code: "MEMBER_MANAGEMENT_FORBIDDEN" });
  });
});
