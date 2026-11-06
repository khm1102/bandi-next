import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member } from "@/features/member/schema";
import { createCalendarService } from "@/features/calendar/service";
import { isMidnightKst } from "@/features/calendar/model";

let db: NodePgDatabase;
let admin: number, leaderA: number, memberA: number, leaderB: number, suspended: number;
const svc = () => createCalendarService({ db, now: () => new Date("2026-11-07T00:00:00Z") });
const ev = (over: Record<string, unknown> = {}) => ({
  teamId: 3,
  title: "연습",
  startAt: new Date("2026-11-20T01:00:00Z"),
  endAt: new Date("2026-11-20T03:00:00Z"),
  isAllDay: false,
  ...over,
});

async function add(studentNo: string, role: string, teamId: number, status = "ACTIVE") {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({ studentNo, name: studentNo, teamId, cohortId: c.id, role, status, ssoLinkStatus: "LINKED" })
    .returning({ id: member.id });
  return row.id;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  admin = await add("1", "ADMIN", 3);
  leaderA = await add("2", "LEADER", 3);
  memberA = await add("3", "MEMBER", 3);
  leaderB = await add("4", "LEADER", 4);
  suspended = await add("5", "ADMIN", 3, "SUSPENDED");
});

describe("종일 일정 KST 판정", () => {
  it("한국 시간 자정만 날짜 경계로 인정한다", () => {
    expect(isMidnightKst(new Date("2026-11-19T15:00:00Z"))).toBe(true); // 11/20 00:00 KST
    expect(isMidnightKst(new Date("2026-11-20T00:00:00Z"))).toBe(false); // 11/20 09:00 KST
  });
});

describe("일정 관리 권한", () => {
  it("ADMIN은 전체·모든 팀, LEADER는 자기 팀 일정만 등록한다", async () => {
    await expect(svc().create(admin, ev({ teamId: null }))).resolves.toBeGreaterThan(0);
    await expect(svc().create(admin, ev({ teamId: 4 }))).resolves.toBeGreaterThan(0);
    await expect(svc().create(leaderA, ev({ teamId: 3 }))).resolves.toBeGreaterThan(0);
    await expect(svc().create(leaderA, ev({ teamId: 4 }))).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await expect(svc().create(leaderA, ev({ teamId: null }))).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await expect(svc().create(memberA, ev())).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
  });

  it("비활성 운영진은 관리할 수 없다", async () => {
    await expect(svc().create(suspended, ev())).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
  });

  it("타팀 팀장은 수정·삭제할 수 없고, 수정으로 일정을 다른 팀으로 옮길 수도 없다", async () => {
    const id = await svc().create(leaderA, ev({ teamId: 3 }));
    await expect(svc().update(leaderB, id, ev({ teamId: 4 }))).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await expect(svc().delete(leaderB, id)).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await expect(svc().update(leaderA, id, ev({ teamId: 4 }))).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await expect(svc().update(leaderA, id, ev({ teamId: null }))).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
    await svc().update(leaderA, id, ev({ teamId: 3, title: "변경" }));
    expect((await svc().lookup(memberA, id)).title).toBe("변경");
  });

  it("삭제하면 조회·수정 대상에서 제외된다", async () => {
    const id = await svc().create(admin, ev());
    await svc().delete(admin, id);
    await expect(svc().lookup(admin, id)).rejects.toMatchObject({ code: "CALENDAR_EVENT_NOT_FOUND" });
    await expect(svc().update(admin, id, ev())).rejects.toMatchObject({ code: "CALENDAR_EVENT_NOT_FOUND" });
  });

  it("존재하지 않는 팀이나 잘못된 입력은 거부한다", async () => {
    await expect(svc().create(admin, ev({ teamId: 999 }))).rejects.toMatchObject({ code: "INVALID_TEAM" });
    await expect(svc().create(admin, ev({ title: " " }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc().create(admin, ev({ endAt: new Date("2026-11-20T01:00:00Z") }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc().create(admin, ev({ color: "RED" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc().create(admin, ev({ isAllDay: true }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("종일 일정은 KST 자정 경계로 저장한다", async () => {
    const id = await svc().create(admin, ev({
      isAllDay: true,
      startAt: new Date("2026-11-19T15:00:00Z"),
      endAt: new Date("2026-11-21T15:00:00Z"),
    }));
    expect((await svc().lookup(admin, id)).isAllDay).toBe(true);
  });
});

describe("조회", () => {
  it("기간은 반개구간으로 겹침을 판정한다", async () => {
    await svc().create(admin, ev({ startAt: new Date("2026-11-20T00:00:00Z"), endAt: new Date("2026-11-21T00:00:00Z") }));
    const search = (from: string, to: string) => svc().search(memberA, { rangeStart: new Date(from), rangeEnd: new Date(to) });
    expect(await search("2026-11-21T00:00:00Z", "2026-11-22T00:00:00Z")).toHaveLength(0);
    expect(await search("2026-11-19T00:00:00Z", "2026-11-20T00:00:00Z")).toHaveLength(0);
    expect(await search("2026-11-20T23:00:00Z", "2026-11-22T00:00:00Z")).toHaveLength(1);
  });

  it("팀 필터를 선택해도 동아리 전체 일정은 함께 조회한다", async () => {
    await svc().create(admin, ev({ teamId: null, title: "전체" }));
    await svc().create(admin, ev({ teamId: 3, title: "배우팀" }));
    await svc().create(admin, ev({ teamId: 4, title: "무대팀" }));
    const range = { rangeStart: new Date("2026-11-01T00:00:00Z"), rangeEnd: new Date("2026-12-01T00:00:00Z") };
    expect((await svc().search(memberA, { ...range, teamId: 3 })).map((e) => e.title).sort()).toEqual(["배우팀", "전체"]);
    expect(await svc().search(memberA, range)).toHaveLength(3);
  });

  it("비활성 멤버는 조회할 수 없다", async () => {
    await expect(svc().search(suspended, { rangeStart: new Date(), rangeEnd: new Date() })).rejects.toMatchObject({ code: "CALENDAR_ACCESS_DENIED" });
  });

  it("가까운 일정은 현재 시각 이후만 시작 순으로 반환한다", async () => {
    await svc().create(admin, ev({ title: "지난", startAt: new Date("2026-11-01T00:00:00Z"), endAt: new Date("2026-11-02T00:00:00Z") }));
    await svc().create(admin, ev({ title: "나중", startAt: new Date("2026-12-01T00:00:00Z"), endAt: new Date("2026-12-02T00:00:00Z") }));
    await svc().create(admin, ev({ title: "곧" }));
    expect((await svc().upcoming(memberA)).map((e) => e.title)).toEqual(["곧", "나중"]);
  });
});
