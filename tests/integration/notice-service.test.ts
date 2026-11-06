import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member } from "@/features/member/schema";
import { internalNotice, internalNoticeRead } from "@/features/notice/schema";
import { createNoticeService } from "@/features/notice/service";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";

let db: NodePgDatabase;
let root: string;
let clock: Date;
let admin: number, leaderA: number, leaderB: number, memberA: number, memberB: number, suspended: number;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const PDF = Buffer.from("%PDF-1.7 content");
const files = () => createFileService({ db, storage: new LocalFileStorage(root), maxUploadBytes: 1024 * 1024, now: () => clock });
const svc = () => createNoticeService({ db, files: files(), now: () => clock });
const hours = (h: number) => new Date(clock.getTime() + h * 3600_000);
const body = (extra: Record<string, unknown> = {}) => ({
  targetScope: "ALL" as const,
  teamId: null as number | null,
  title: "공지",
  body: "본문",
  important: false,
  attachmentFileIds: [] as number[],
  ...extra,
});

async function add(studentNo: string, role: string, teamId: number, status = "ACTIVE") {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({ studentNo, name: `m${studentNo}`, teamId, cohortId: c.id, role, status, ssoLinkStatus: "LINKED" })
    .returning({ id: member.id });
  return row.id;
}

async function upload(actorId: number, name: string, bytes: Buffer) {
  const ref = await files().upload({
    kind: "general",
    domain: "notice",
    file: { name, size: bytes.length, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) },
    actorId,
  });
  return ref.id;
}

/** 초안 → 즉시 게시까지 한 번에 */
async function published(actor: number, extra: Record<string, unknown> = {}) {
  const id = await svc().createDraft(actor, body(extra));
  await svc().publish(actor, id);
  return id;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  clock = new Date("2026-11-07T00:00:00Z");
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-notice-"));
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  admin = await add("1", "ADMIN", 3);
  leaderA = await add("2", "LEADER", 3);
  leaderB = await add("3", "LEADER", 4);
  memberA = await add("4", "MEMBER", 3);
  memberB = await add("5", "MEMBER", 4);
  suspended = await add("6", "MEMBER", 3, "SUSPENDED");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("작성 권한", () => {
  it("전체 공지는 ADMIN만, 팀 공지는 해당 팀 LEADER와 ADMIN만 작성한다", async () => {
    await expect(svc().createDraft(admin, body())).resolves.toBeGreaterThan(0);
    await expect(svc().createDraft(leaderA, body({ targetScope: "TEAM", teamId: 3 }))).resolves.toBeGreaterThan(0);
    await expect(svc().createDraft(leaderA, body())).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().createDraft(leaderA, body({ targetScope: "TEAM", teamId: 4 }))).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().createDraft(memberA, body())).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
  });

  it("범위와 팀 조합·존재하지 않는 팀·빈 제목을 거부한다", async () => {
    await expect(svc().createDraft(admin, body({ teamId: 3 }))).rejects.toMatchObject({ code: "INVALID_NOTICE" });
    await expect(svc().createDraft(admin, body({ targetScope: "TEAM", teamId: 999 }))).rejects.toMatchObject({ code: "INVALID_TEAM" });
    await expect(svc().createDraft(admin, body({ title: " " }))).rejects.toMatchObject({ code: "INVALID_NOTICE" });
  });

  it("타팀 팀장은 수정·게시·삭제할 수 없고 팀을 바꿔 가로챌 수도 없다", async () => {
    const id = await svc().createDraft(leaderA, body({ targetScope: "TEAM", teamId: 3 }));
    await expect(svc().update(leaderB, id, body({ targetScope: "TEAM", teamId: 4 }))).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().publish(leaderB, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().deleteDraft(leaderB, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().update(leaderA, id, body({ targetScope: "TEAM", teamId: 4 }))).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().lookupManageable(leaderB, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
  });
});

describe("가시성", () => {
  it("전체 공지는 모든 활성 멤버, 팀 공지는 해당 팀과 ADMIN에게만 보인다", async () => {
    const all = await published(admin);
    const teamA = await published(leaderA, { targetScope: "TEAM", teamId: 3, title: "A팀" });
    const idsOf = async (actor: number) => (await svc().searchReadable(actor)).items.map((n) => n.id).sort();
    expect(await idsOf(memberA)).toEqual([all, teamA].sort());
    expect(await idsOf(memberB)).toEqual([all]);
    expect(await idsOf(leaderB)).toEqual([all]);
    expect(await idsOf(admin)).toEqual([all, teamA].sort());
    await expect(svc().lookupReadable(memberB, teamA)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
  });

  it("초안·종료·보관·삭제·예약(미래)·기간 만료 공지는 멤버에게 보이지 않는다", async () => {
    const draft = await svc().createDraft(admin, body());
    const scheduled = await svc().createDraft(admin, body());
    await svc().publish(admin, scheduled, { start: hours(2) });
    const closed = await published(admin);
    await svc().close(admin, closed);
    const expiring = await svc().createDraft(admin, body());
    await svc().publish(admin, expiring, { start: hours(-2), end: hours(-1) });
    for (const id of [draft, scheduled, closed, expiring]) {
      await expect(svc().lookupReadable(memberA, id)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    }
    expect((await svc().searchReadable(memberA)).total).toBe(0);
    clock = hours(3); // 예약 시각이 지나면 보인다
    expect((await svc().searchReadable(memberA)).items.map((n) => n.id)).toEqual([scheduled]);
  });

  it("비활성 멤버는 조회할 수 없다", async () => {
    await expect(svc().searchReadable(suspended)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
  });

  it("목록은 중요 공지 → 최신 순이며 키워드·범위·미확인 필터를 지원한다", async () => {
    const old = await published(admin, { title: "오래된 공지", body: "alpha" });
    clock = hours(1);
    const recent = await published(admin, { title: "최근 공지", body: "beta" });
    clock = hours(2);
    const important = await published(admin, { title: "중요 공지", important: true });
    expect((await svc().searchReadable(memberA)).items.map((n) => n.id)).toEqual([important, recent, old]);
    expect((await svc().searchReadable(memberA, { keyword: "alpha" })).items.map((n) => n.id)).toEqual([old]);
    expect((await svc().searchReadable(memberA, { keyword: "%" })).total).toBe(0);
    await svc().lookupReadable(memberA, recent);
    expect((await svc().searchReadable(memberA, { unreadOnly: true })).items.map((n) => n.id)).toEqual([important, old]);
  });
});

describe("읽음 상태", () => {
  it("열람 시 최초·최근 읽음을 남기고 두 번째부터는 최근 시각만 갱신한다", async () => {
    const id = await published(admin);
    await svc().lookupReadable(memberA, id);
    clock = hours(5);
    await svc().lookupReadable(memberA, id);
    const [read] = await db.select().from(internalNoticeRead).where(eq(internalNoticeRead.memberId, memberA));
    expect(read.firstReadAt.getTime()).toBe(new Date("2026-11-07T00:00:00Z").getTime());
    expect(read.lastReadAt.getTime()).toBe(hours(0).getTime());
  });

  it("관리 상세 조회는 읽음을 남기지 않고, 현황은 대상 활성 멤버별로 보여준다", async () => {
    const id = await published(admin);
    await svc().lookupManageable(admin, id);
    expect(await db.select().from(internalNoticeRead)).toHaveLength(0);
    await svc().lookupReadable(memberA, id);
    const statuses = await svc().searchReadStatuses(admin, id);
    expect(statuses).toHaveLength(5); // 비활성 제외
    expect(statuses.find((s) => s.memberId === memberA)?.firstReadAt).not.toBeNull();
    expect(statuses.find((s) => s.memberId === memberB)?.firstReadAt).toBeNull();
  });

  it("팀 공지의 읽음 현황은 해당 팀 멤버만, 초안은 현황이 없다", async () => {
    const id = await published(leaderA, { targetScope: "TEAM", teamId: 3 });
    expect((await svc().searchReadStatuses(leaderA, id)).map((s) => s.memberId).sort()).toEqual([admin, leaderA, memberA].sort());
    await expect(svc().searchReadStatuses(leaderB, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    const draft = await svc().createDraft(admin, body());
    await expect(svc().searchReadStatuses(admin, draft)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
  });
});

describe("상태 전이", () => {
  it("DRAFT→PUBLISHED→CLOSED→ARCHIVED 흐름과 허용되지 않는 전이", async () => {
    const id = await svc().createDraft(admin, body());
    await expect(svc().close(admin, id)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await expect(svc().archive(admin, id)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await svc().publish(admin, id);
    await expect(svc().deleteDraft(admin, id)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await expect(svc().archive(admin, id)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await svc().close(admin, id);
    await expect(svc().publish(admin, id)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await expect(svc().update(admin, id, body())).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
    await svc().archive(admin, id);
    expect((await svc().lookupManageable(admin, id)).status).toBe("ARCHIVED");
  });

  it("예약 공지만 초안으로 되돌릴 수 있고 게시 시각·게시자·읽음 기록이 초기화된다", async () => {
    const id = await svc().createDraft(admin, body());
    await svc().publish(admin, id, { start: hours(1) });
    await db.insert(internalNoticeRead).values({ internalNoticeId: id, memberId: memberA, firstReadAt: clock, lastReadAt: clock });
    await svc().returnToDraft(admin, id);
    const [row] = await db.select().from(internalNotice).where(eq(internalNotice.id, id));
    expect(row).toMatchObject({ status: "DRAFT", publishStartAt: null, publishedByMemberId: null });
    expect(await db.select().from(internalNoticeRead)).toHaveLength(0);
    const live = await published(admin);
    await expect(svc().returnToDraft(admin, live)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
  });

  it("초안만 삭제할 수 있고 삭제된 공지는 조회·수정되지 않는다", async () => {
    const id = await svc().createDraft(admin, body());
    await svc().deleteDraft(admin, id);
    await expect(svc().lookupManageable(admin, id)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    await expect(svc().update(admin, id, body())).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
  });

  it("게시 종료가 시작보다 빠르면 거부한다", async () => {
    const id = await svc().createDraft(admin, body());
    await expect(svc().publish(admin, id, { start: hours(2), end: hours(1) })).rejects.toMatchObject({ code: "INVALID_NOTICE" });
  });
});

describe("관리 목록", () => {
  it("팀장은 자기 팀의 팀 공지만, ADMIN은 전체를 본다", async () => {
    const all = await svc().createDraft(admin, body());
    const teamA = await svc().createDraft(leaderA, body({ targetScope: "TEAM", teamId: 3 }));
    const teamB = await svc().createDraft(leaderB, body({ targetScope: "TEAM", teamId: 4 }));
    expect((await svc().searchManageable(leaderA)).items.map((n) => n.id)).toEqual([teamA]);
    expect((await svc().searchManageable(admin)).items.map((n) => n.id).sort()).toEqual([all, teamA, teamB].sort());
    await expect(svc().searchManageable(memberA)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
  });
});

describe("첨부와 본문 이미지", () => {
  it("본인이 올린 파일만 연결할 수 있고 타인의 파일 ID는 거부한다", async () => {
    const mine = await upload(admin, "a.pdf", PDF);
    const others = await upload(leaderA, "b.pdf", PDF);
    await expect(svc().createDraft(admin, body({ attachmentFileIds: [mine, others] }))).rejects.toMatchObject({ code: "FI003" });
    const id = await svc().createDraft(admin, body({ attachmentFileIds: [mine] }));
    expect((await svc().lookupManageable(admin, id)).attachments.map((a) => a.id)).toEqual([mine]);
  });

  it("중복·과다 첨부를 거부한다", async () => {
    const a = await upload(admin, "a.pdf", PDF);
    await expect(svc().createDraft(admin, body({ attachmentFileIds: [a, a] }))).rejects.toMatchObject({ code: "INVALID_NOTICE" });
  });

  it("다른 수정자가 저장해도 기존 첨부는 유지되고 새 첨부는 수정자 소유여야 한다", async () => {
    const original = await upload(leaderA, "a.pdf", PDF);
    const id = await svc().createDraft(leaderA, body({ targetScope: "TEAM", teamId: 3, attachmentFileIds: [original] }));
    const adminFile = await upload(admin, "b.pdf", PDF);
    await svc().update(admin, id, body({ targetScope: "TEAM", teamId: 3, attachmentFileIds: [original, adminFile] }));
    expect((await svc().lookupManageable(admin, id)).attachments).toHaveLength(2);
    const leaderFile = await upload(leaderA, "c.pdf", PDF);
    await expect(svc().update(admin, id, body({ targetScope: "TEAM", teamId: 3, attachmentFileIds: [original, leaderFile] }))).rejects.toMatchObject({ code: "FI003" });
  });

  it("본문 이미지는 첨부된 이미지 파일만 참조할 수 있다", async () => {
    const img = await upload(admin, "p.png", PNG);
    const pdf = await upload(admin, "d.pdf", PDF);
    await expect(svc().createDraft(admin, body({ body: `![x](attachment://${img})` }))).rejects.toMatchObject({ code: "INVALID_NOTICE" });
    await expect(svc().createDraft(admin, body({ body: `![x](attachment://${pdf})`, attachmentFileIds: [pdf] }))).rejects.toMatchObject({ code: "INVALID_NOTICE" });
    const id = await svc().createDraft(admin, body({ body: `![x](attachment://${img})`, attachmentFileIds: [img] }));
    expect((await svc().lookupManageable(admin, id)).html.value).toContain(`/api/internal-notice-management/${id}/attachments/${img}/inline`);
  });

  it("멤버 화면은 인증이 필요한 읽기용 이미지 경로로 렌더링한다", async () => {
    const img = await upload(admin, "p.png", PNG);
    const id = await published(admin, { body: `![x](attachment://${img})`, attachmentFileIds: [img] });
    expect((await svc().lookupReadable(memberA, id)).html.value).toContain(`/api/internal-notices/${id}/attachments/${img}/inline`);
  });

  it("첨부는 읽을 수 있는 공지에서만 열린다 (타팀·초안·다른 공지 경로 거부)", async () => {
    const file = await upload(leaderA, "a.pdf", PDF);
    const id = await published(leaderA, { targetScope: "TEAM", teamId: 3, attachmentFileIds: [file] });
    const opened = await svc().openAttachment(memberA, id, file, "attachment");
    opened.object.stream.destroy();
    await expect(svc().openAttachment(memberB, id, file, "attachment")).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    const other = await published(admin);
    await expect(svc().openAttachment(memberA, other, file, "attachment")).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    const draftFile = await upload(admin, "d.pdf", PDF);
    const draft = await svc().createDraft(admin, body({ attachmentFileIds: [draftFile] }));
    await expect(svc().openAttachment(memberA, draft, draftFile, "attachment")).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    const manage = await svc().openManageableAttachment(admin, draft, draftFile, "attachment");
    manage.object.stream.destroy();
    await expect(svc().openManageableAttachment(leaderB, id, file, "attachment")).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
  });
});

describe("제목 공개 공유 링크", () => {
  it("작성자와 관리 권한자만 발급하고 일반 멤버는 발급할 수 없다", async () => {
    const id = await published(leaderA, { targetScope: "TEAM", teamId: 3 });
    await expect(svc().issueShare(memberA, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    await expect(svc().issueShare(leaderB, id)).rejects.toMatchObject({ code: "NOTICE_ACCESS_DENIED" });
    const token = await svc().issueShare(leaderA, id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(svc().issueShare(admin, id)).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("공개 조회는 제목만 반환하고, 재발급하면 이전 링크는 무효가 된다", async () => {
    const id = await published(admin, { title: "공개 제목", body: "비밀 본문" });
    const first = await svc().issueShare(admin, id);
    expect(await svc().lookupPublicShare(first)).toEqual({ id, title: "공개 제목" });
    const second = await svc().issueShare(admin, id);
    await expect(svc().lookupPublicShare(first)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    await expect(svc().lookupPublicShare(second)).resolves.toBeDefined();
  });

  it("중단·종료·기간 만료·잘못된 토큰 형식은 모두 404다", async () => {
    const id = await published(admin);
    const token = await svc().issueShare(admin, id);
    await svc().revokeShare(admin, id);
    await expect(svc().lookupPublicShare(token)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    const token2 = await svc().issueShare(admin, id);
    await svc().close(admin, id);
    await expect(svc().lookupPublicShare(token2)).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    await expect(svc().lookupPublicShare("short")).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
    await expect(svc().lookupPublicShare("a".repeat(43))).rejects.toMatchObject({ code: "NOTICE_NOT_FOUND" });
  });

  it("게시되지 않은 공지(초안)에는 공유 링크를 발급할 수 없다", async () => {
    const draft = await svc().createDraft(admin, body());
    await expect(svc().issueShare(admin, draft)).rejects.toMatchObject({ code: "INVALID_NOTICE_STATE" });
  });
});
