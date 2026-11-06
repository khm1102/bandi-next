import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb, violation } from "./helpers";
import { cohort, member, team } from "@/features/member/schema";
import { calendarEvent } from "@/features/calendar/schema";
import { internalNotice } from "@/features/notice/schema";
import { activityRecord, activityReportDocument } from "@/features/activity/schema";
import { assetItem } from "@/features/asset/schema";
import { resource } from "@/features/resource/schema";

let db: NodePgDatabase;
let memberId: number;

async function insertMember(studentNo: string, overrides: Partial<typeof member.$inferInsert> = {}) {
  const [row] = await db
    .insert(member)
    .values({
      studentNo,
      name: "테스터",
      teamId: 3,
      cohortId: (await db.select().from(cohort).limit(1))[0].id,
      role: "MEMBER",
      status: "ACTIVE",
      ssoLinkStatus: "LINKED",
      ...overrides,
    })
    .returning({ id: member.id });
  return row.id;
}

beforeAll(async () => {
  db = await testDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  memberId = await insertMember("2025000001");
});

describe("team 시드", () => {
  it("초기 팀 11개가 표시 순서대로 존재한다", async () => {
    const teams = await db.select().from(team).orderBy(team.displayOrder);
    expect(teams).toHaveLength(11);
    expect(teams[0].name).toBe("연출");
    expect(teams[10].name).toBe("영상 편집");
  });
});

describe("member 제약", () => {
  it("학번은 중복될 수 없다", async () => {
    const result = await violation(insertMember("2025000001"));
    expect(result.code).toBe("23505");
  });

  it("허용되지 않은 역할 코드는 거부한다", async () => {
    const result = await violation(insertMember("2025000002", { role: "OWNER" }));
    expect(result.constraint).toBe("ck_member_role");
  });

  it("허용되지 않은 활동 상태는 거부한다", async () => {
    const result = await violation(insertMember("2025000003", { status: "GONE" }));
    expect(result.constraint).toBe("ck_member_status");
  });

  it("updated_at 트리거가 수정 시각을 갱신한다", async () => {
    const [before] = await db.select().from(member).where(eq(member.id, memberId));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await db.update(member).set({ name: "변경" }).where(eq(member.id, memberId));
    const [after] = await db.select().from(member).where(eq(member.id, memberId));
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});

describe("calendar_event 제약", () => {
  const base = () => ({
    title: "연습",
    createdByMemberId: memberId,
    updatedByMemberId: memberId,
  });

  it("종료 시각이 시작 시각 이하이면 거부한다", async () => {
    const at = new Date("2026-11-20T10:00:00Z");
    const result = await violation(
      db.insert(calendarEvent).values({ ...base(), startAt: at, endAt: at }),
    );
    expect(result.constraint).toBe("ck_calendar_event_period");
  });

  it("허용되지 않은 색상은 거부한다", async () => {
    const result = await violation(
      db.insert(calendarEvent).values({
        ...base(),
        startAt: new Date("2026-11-20T10:00:00Z"),
        endAt: new Date("2026-11-20T11:00:00Z"),
        color: "RED",
      }),
    );
    expect(result.constraint).toBe("ck_calendar_event_color");
  });

  it("기간 겹침은 반개구간(start < rangeEnd AND end > rangeStart)으로 판정한다", async () => {
    await db.insert(calendarEvent).values({
      ...base(),
      startAt: new Date("2026-11-20T00:00:00Z"),
      endAt: new Date("2026-11-21T00:00:00Z"),
    });
    const overlaps = async (from: string, to: string) =>
      (
        await db.execute(
          sql`select 1 from calendar_event
              where deleted_at is null
                and tstzrange(start_at, end_at) && tstzrange(${from}::timestamptz, ${to}::timestamptz)`,
        )
      ).rows.length;
    expect(await overlaps("2026-11-21T00:00:00Z", "2026-11-22T00:00:00Z")).toBe(0);
    expect(await overlaps("2026-11-20T23:00:00Z", "2026-11-22T00:00:00Z")).toBe(1);
  });
});

describe("internal_notice 제약", () => {
  const base = () => ({
    title: "공지",
    body: "본문",
    status: "DRAFT",
    createdByMemberId: memberId,
    updatedByMemberId: memberId,
  });

  it("ALL 범위에 팀이 있으면 거부한다", async () => {
    const result = await violation(
      db.insert(internalNotice).values({ ...base(), targetScope: "ALL", teamId: 3 }),
    );
    expect(result.constraint).toBe("ck_internal_notice_scope_team");
  });

  it("TEAM 범위에 팀이 없으면 거부한다", async () => {
    const result = await violation(db.insert(internalNotice).values({ ...base(), targetScope: "TEAM" }));
    expect(result.constraint).toBe("ck_internal_notice_scope_team");
  });

  it("게시 상태인데 게시 시각·게시자가 없으면 거부한다", async () => {
    const result = await violation(
      db.insert(internalNotice).values({ ...base(), targetScope: "ALL", status: "PUBLISHED" }),
    );
    expect(result.constraint).toBe("ck_internal_notice_publish_state");
  });

  it("공유 토큰은 유일하다", async () => {
    const token = "a".repeat(43);
    await db.insert(internalNotice).values({ ...base(), targetScope: "ALL", shareToken: token });
    const result = await violation(
      db.insert(internalNotice).values({ ...base(), targetScope: "ALL", shareToken: token }),
    );
    expect(result.code).toBe("23505");
  });

  it("공유 토큰이 NULL인 공지는 여러 건 허용한다", async () => {
    await db.insert(internalNotice).values({ ...base(), targetScope: "ALL" });
    await db.insert(internalNotice).values({ ...base(), targetScope: "ALL" });
    const rows = await db.select().from(internalNotice);
    expect(rows).toHaveLength(2);
  });
});

describe("activity 제약", () => {
  const record = (overrides: Partial<typeof activityRecord.$inferInsert> = {}) => ({
    teamId: 3,
    activityAt: new Date("2026-11-01T10:00:00Z"),
    title: "활동",
    body: "내용",
    participantCount: 3,
    status: "DRAFT",
    createdByMemberId: memberId,
    updatedByMemberId: memberId,
    ...overrides,
  });

  it("초안은 제출·검수 시각이 없어야 한다", async () => {
    const result = await violation(
      db.insert(activityRecord).values(record({ submittedAt: new Date() })),
    );
    expect(result.constraint).toBe("ck_activity_record_status_times");
  });

  it("승인 상태는 검수자와 검수 시각이 필요하다", async () => {
    const result = await violation(
      db.insert(activityRecord).values(record({ status: "APPROVED", submittedAt: new Date() })),
    );
    expect(result.constraint).toBe("ck_activity_record_status_times");
  });

  it("참여 인원은 1명 이상이어야 한다", async () => {
    const result = await violation(db.insert(activityRecord).values(record({ participantCount: 0 })));
    expect(result.constraint).toBe("ck_activity_record_participants");
  });

  it("활동 내역서 참여자는 1~14명만 허용한다", async () => {
    const [created] = await db.insert(activityRecord).values(record()).returning({ id: activityRecord.id });
    const person = { name: "가", department: null, studentNo: null, note: null };
    const doc = (participants: unknown[]) => ({
      activityRecordId: created.id,
      representative: "대표",
      location: "강당",
      participants: participants as never,
    });
    expect((await violation(db.insert(activityReportDocument).values(doc([])))).constraint).toBe(
      "ck_activity_report_participants",
    );
    expect(
      (await violation(db.insert(activityReportDocument).values(doc(Array(15).fill(person))))).constraint,
    ).toBe("ck_activity_report_participants");
    await db.insert(activityReportDocument).values(doc(Array(14).fill(person)));
  });
});

describe("asset_item 제약", () => {
  const item = (overrides: Partial<typeof assetItem.$inferInsert> = {}) => ({
    name: "소품",
    category: "PROP",
    trackingType: "QUANTITY",
    ownerType: "CLUB",
    totalQuantity: 1,
    storageLocation: "창고",
    status: "AVAILABLE",
    ...overrides,
  });

  it("동아리 소유 품목에 외부 소유자명이 있으면 거부한다", async () => {
    const result = await violation(db.insert(assetItem).values(item({ externalOwnerName: "외부" })));
    expect(result.constraint).toBe("ck_asset_item_owner_scope");
  });

  it("개인 소유 품목은 소유 멤버가 필요하다", async () => {
    const result = await violation(db.insert(assetItem).values(item({ ownerType: "MEMBER" })));
    expect(result.constraint).toBe("ck_asset_item_owner_scope");
  });

  it("수량은 1 이상이어야 한다", async () => {
    const result = await violation(db.insert(assetItem).values(item({ totalQuantity: 0 })));
    expect(result.constraint).toBe("ck_asset_item_quantity");
  });
});

describe("resource", () => {
  it("제목 trigram 인덱스를 사용하는 부분 문자열 검색이 동작한다", async () => {
    await db.insert(resource).values({
      title: "연극 대본 모음",
      bodyMarkdown: "내용",
      createdByMemberId: memberId,
      updatedByMemberId: memberId,
    });
    const rows = await db.execute(sql`select 1 from resource where title ilike ${"%대본%"}`);
    expect(rows.rows).toHaveLength(1);
  });
});
