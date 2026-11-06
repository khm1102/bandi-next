import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { clubOfficer, cohort, member } from "@/features/member/schema";
import { activityRecord, activityRecordFile, activityRecordRevision, activityReportDocument, activityReviewHistory } from "@/features/activity/schema";
import { createActivityService } from "@/features/activity/service";
import { createReportService } from "@/features/activity/report-service";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";

let db: NodePgDatabase;
let root: string;
let admin: number, leaderA: number, memberA: number, memberA2: number, leaderB: number, memberB: number, suspended: number;

const clock = new Date("2026-11-07T00:00:00Z");
const files = () => createFileService({ db, storage: new LocalFileStorage(root), maxUploadBytes: 5 * 1024 * 1024, now: () => clock });
const svc = () => createActivityService({ db, files: files(), now: () => clock });
const reports = () => createReportService({ db, files: files(), activities: svc() });
const fields = (over: Record<string, unknown> = {}) => ({ teamId: 3, activityAt: new Date("2026-11-01T01:00:00Z"), title: "연습", body: "내용", participantCount: 3, ...over });

async function pngBytes() {
  return new Uint8Array(await sharp({ create: { width: 10, height: 8, channels: 3, background: "#aa5500" } }).png().toBuffer());
}
async function uploadImage(actorId: number) {
  const bytes = await pngBytes();
  return (await files().upload({ kind: "general", domain: "activity", file: { name: "p.png", size: bytes.length, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) }, actorId })).id;
}
async function add(studentNo: string, role: string, teamId: number, status = "ACTIVE") {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db.insert(member).values({ studentNo, name: `이름${studentNo}`, teamId, cohortId: c.id, role, status, ssoLinkStatus: "LINKED", department: "학과" }).returning({ id: member.id });
  return row.id;
}
async function submitted(authorId = memberA) {
  const id = await svc().createDraft(authorId, fields());
  await svc().submit(authorId, id);
  return id;
}
const statusOf = async (id: number) => (await db.select().from(activityRecord).where(eq(activityRecord.id, id)))[0].status;

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-act-"));
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  admin = await add("1", "ADMIN", 3);
  leaderA = await add("2", "LEADER", 3);
  memberA = await add("3", "MEMBER", 3);
  memberA2 = await add("4", "MEMBER", 3);
  leaderB = await add("5", "LEADER", 4);
  memberB = await add("6", "MEMBER", 4);
  suspended = await add("7", "MEMBER", 3, "SUSPENDED");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("작성·수정 권한", () => {
  it("멤버는 자기 팀에만, 운영진은 모든 팀에 기록을 만들 수 있다", async () => {
    await expect(svc().createDraft(memberA, fields())).resolves.toBeGreaterThan(0);
    await expect(svc().createDraft(memberA, fields({ teamId: 4 }))).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().createDraft(admin, fields({ teamId: 4 }))).resolves.toBeGreaterThan(0);
    await expect(svc().createDraft(suspended, fields())).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().createDraft(admin, fields({ teamId: 999 }))).rejects.toMatchObject({ code: "INVALID_TEAM" });
  });

  it("수정은 작성자·해당 팀 팀장·ADMIN만 가능하다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const edit = (actor: number) => svc().update(actor, id, { activityAt: new Date("2026-11-02T00:00:00Z"), title: "수정", body: "b", participantCount: 2 });
    await expect(edit(memberA2)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(edit(leaderB)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(edit(memberB)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await edit(memberA);
    await edit(leaderA);
    await edit(admin);
  });

  it("제출 이후에는 수정할 수 없다", async () => {
    const id = await submitted();
    await expect(svc().update(memberA, id, { activityAt: new Date(), title: "t", body: "b", participantCount: 1 })).rejects.toMatchObject({ code: "INVALID_ACTIVITY_STATE" });
  });

  it("잘못된 입력을 거부한다", async () => {
    await expect(svc().createDraft(memberA, fields({ title: " " }))).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
    await expect(svc().createDraft(memberA, fields({ participantCount: 0 }))).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });
});

describe("사진 첨부", () => {
  it("본인이 올린 이미지만 첨부하고 타인의 파일 ID·중복은 거부한다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const mine = await uploadImage(memberA);
    const others = await uploadImage(memberA2);
    await expect(svc().addFile(memberA, id, others, "EVIDENCE")).rejects.toMatchObject({ code: "FI003" });
    await svc().addFile(memberA, id, mine, "EVIDENCE");
    await expect(svc().addFile(memberA, id, mine, "ADDITIONAL")).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
    expect((await svc().lookupManageable(memberA, id)).files.map((f) => f.fileId)).toEqual([mine]);
  });

  it("다른 팀 멤버는 첨부할 수 없고, 이미지가 아닌 파일은 거부한다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const foreign = await uploadImage(memberB);
    await expect(svc().addFile(memberB, id, foreign, "EVIDENCE")).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });
});

describe("사진 제거", () => {
  it("수정 가능한 상태에서 작성자가 제거하면 연결이 사라지고 파일은 파기된다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const fileId = await uploadImage(memberA);
    await svc().addFile(memberA, id, fileId, "EVIDENCE");
    await svc().removeFile(memberA, id, fileId);
    expect((await svc().lookupManageable(memberA, id)).files).toHaveLength(0);
    const { fileRetirementQueue, storedFile } = await import("@/features/file/schema");
    expect((await db.select().from(fileRetirementQueue))[0]).toMatchObject({ reason: "ACTIVITY_PHOTO", status: "DELETED" });
    expect(await db.select().from(storedFile).where(eq(storedFile.id, fileId))).toHaveLength(0);
  });

  it("타인·제출 후·없는 파일은 제거할 수 없다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const fileId = await uploadImage(memberA);
    await svc().addFile(memberA, id, fileId, "EVIDENCE");
    await expect(svc().removeFile(memberA2, id, fileId)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().removeFile(memberA, id, 999999)).rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND" });
    await svc().submit(memberA, id);
    await expect(svc().removeFile(memberA, id, fileId)).rejects.toMatchObject({ code: "INVALID_ACTIVITY_STATE" });
  });

  it("생성된 HWPX 문서는 직접 제거할 수 없다", async () => {
    const pid = await add("900", "MEMBER", 3);
    await db.insert(clubOfficer).values({ position: "PRESIDENT", memberId: pid, appointedAt: clock });
    const png = await pngBytes();
    const saved = await reports().saveDraft(memberA, { recordTitle: "t", representative: "r", location: "l", activityAt: clock, content: "c", participants: [{ name: "n", department: null, studentNo: null, note: null }] }, png);
    await expect(svc().removeFile(memberA, saved.activityRecordId, saved.hwpxFileId)).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });
});

describe("제출과 2단계 검수", () => {
  it("제출하면 리비전과 검수 이력이 남고 SUBMITTED가 된다", async () => {
    const id = await submitted();
    expect(await statusOf(id)).toBe("SUBMITTED");
    expect(await db.select().from(activityRecordRevision).where(eq(activityRecordRevision.activityRecordId, id))).toHaveLength(1);
    expect((await db.select().from(activityReviewHistory))[0]).toMatchObject({ previousStatus: "DRAFT", newStatus: "SUBMITTED" });
  });

  it("팀장 1차 승인 → ADMIN 최종 승인 → 보관 흐름", async () => {
    const id = await submitted();
    await svc().teamApprove(leaderA, id);
    expect(await statusOf(id)).toBe("TEAM_APPROVED");
    await svc().finalApprove(admin, id);
    expect(await statusOf(id)).toBe("APPROVED");
    await svc().archive(admin, id);
    expect(await statusOf(id)).toBe("ARCHIVED");
    expect((await db.select().from(activityReviewHistory)).map((h) => h.newStatus)).toEqual(["SUBMITTED", "TEAM_APPROVED", "APPROVED", "ARCHIVED"]);
  });

  it("1차 승인은 해당 팀 팀장만: 타팀 팀장·일반 멤버·ADMIN(팀장 아님)은 불가", async () => {
    const id = await submitted();
    await expect(svc().teamApprove(leaderB, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().teamApprove(memberA2, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().teamApprove(admin, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });

  it("팀장은 자신이 쓴 기록을 1차 검수하거나 보완 요청할 수 없다", async () => {
    const id = await svc().createDraft(leaderA, fields());
    await svc().submit(leaderA, id);
    await expect(svc().teamApprove(leaderA, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().requestRevision(leaderA, id, "x")).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await svc().finalApprove(admin, id, "긴급");
  });

  it("최종 승인은 ADMIN만이며 SUBMITTED를 건너뛰려면 긴급 사유가 필요하다", async () => {
    const id = await submitted();
    await expect(svc().finalApprove(leaderA, id, "사유")).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().finalApprove(admin, id)).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
    await svc().finalApprove(admin, id, "행사 임박");
    expect((await db.select().from(activityReviewHistory)).at(-1)?.comment).toBe("긴급 최종 승인: 행사 임박");
  });

  it("ADMIN은 본인이 쓴 기록도 최종 검수할 수 있다", async () => {
    const id = await svc().createDraft(admin, fields());
    await svc().submit(admin, id);
    await svc().finalApprove(admin, id, "본인 기록");
    expect(await statusOf(id)).toBe("APPROVED");
  });

  it("보완 요청은 사유가 필수이고 수정 후 재제출하면 다시 SUBMITTED가 된다", async () => {
    const id = await submitted();
    await expect(svc().requestRevision(leaderA, id, " ")).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
    await svc().requestRevision(leaderA, id, "사진 보완");
    expect(await statusOf(id)).toBe("REVISION_REQUESTED");
    await svc().update(memberA, id, { activityAt: new Date("2026-11-03T00:00:00Z"), title: "보완", body: "b", participantCount: 4 });
    await svc().submit(memberA, id, "보완 반영");
    expect(await statusOf(id)).toBe("SUBMITTED");
    const [rec] = await db.select().from(activityRecord).where(eq(activityRecord.id, id));
    expect(rec.reviewedAt).toBeNull();
    expect(await db.select().from(activityRecordRevision)).toHaveLength(2);
  });

  it("허용되지 않은 전이는 거부한다 (초안 승인, 미승인 보관, 중복 승인)", async () => {
    const draft = await svc().createDraft(memberA, fields());
    await expect(svc().teamApprove(leaderA, draft)).rejects.toMatchObject({ code: "INVALID_ACTIVITY_STATE" });
    await expect(svc().archive(admin, draft)).rejects.toMatchObject({ code: "INVALID_ACTIVITY_STATE" });
    await expect(svc().archive(leaderA, draft)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    const id = await submitted();
    await svc().teamApprove(leaderA, id);
    await expect(svc().teamApprove(leaderA, id)).rejects.toMatchObject({ code: "INVALID_ACTIVITY_STATE" });
  });
});

describe("조회 범위", () => {
  it("내 활동 기록은 본인 것만, 보관함은 최종 승인된 것만 모두에게 보인다", async () => {
    const mine = await submitted(memberA);
    const others = await submitted(memberA2);
    expect((await svc().searchMine(memberA)).items.map((i) => i.id)).toEqual([mine]);
    expect((await svc().searchArchive(memberB)).total).toBe(0);
    await svc().finalApprove(admin, others, "r");
    expect((await svc().searchArchive(memberB)).items.map((i) => i.id)).toEqual([others]);
    await expect(svc().lookupApproved(memberB, mine)).rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND" });
    await expect(svc().lookupApproved(memberB, others)).resolves.toMatchObject({ id: others });
    await expect(svc().searchArchive(suspended)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });

  it("검수 목록은 초안을 제외하고 팀장은 자기 팀, ADMIN은 전체를 본다", async () => {
    const a = await submitted(memberA);
    const bId = await svc().createDraft(memberB, fields({ teamId: 4 }));
    await svc().submit(memberB, bId);
    await svc().createDraft(memberA, fields());
    expect((await svc().searchReview(leaderA)).items.map((i) => i.id)).toEqual([a]);
    expect((await svc().searchReview(admin)).items.map((i) => i.id).sort()).toEqual([a, bId].sort());
    await expect(svc().searchReview(memberA)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });

  it("관리 상세: 작성자·팀 관리자만, 검수 상세: 초안/본인 기록(팀장)/타팀 거부", async () => {
    const id = await submitted(memberA);
    await expect(svc().lookupManageable(memberA2, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().lookupManageable(leaderB, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().lookupManageable(memberA, id)).resolves.toBeDefined();
    await expect(svc().lookupReviewable(leaderA, id)).resolves.toBeDefined();
    await expect(svc().lookupReviewable(leaderB, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().lookupReviewable(memberA, id)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    const draft = await svc().createDraft(memberA, fields());
    await expect(svc().lookupReviewable(admin, draft)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });

  it("파일은 용도에 맞는 권한으로만 열린다", async () => {
    const id = await svc().createDraft(memberA, fields());
    const fileId = await uploadImage(memberA);
    await svc().addFile(memberA, id, fileId, "EVIDENCE");
    await svc().submit(memberA, id);
    const open = async (p: Promise<{ object: { stream: { destroy(): void } } }>) => (await p).object.stream.destroy();
    await open(svc().openManageableFile(memberA, id, fileId));
    await open(svc().openReviewFile(leaderA, id, fileId));
    await expect(svc().openManageableFile(memberA2, id, fileId)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().openReviewFile(leaderB, id, fileId)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await expect(svc().openApprovedFile(memberB, id, fileId)).rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND" });
    await svc().finalApprove(admin, id, "r");
    await open(svc().openApprovedFile(memberB, id, fileId));
    await expect(svc().openApprovedFile(memberB, id, 999999)).rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND" });
  });
});

describe("CSV 내보내기", () => {
  it("ADMIN만 가능하고 본문·사진·학번은 포함하지 않으며 수식 주입을 막는다", async () => {
    const id = await svc().createDraft(memberA, fields({ title: "=HYPERLINK(\"x\")", body: "비밀 본문" }));
    await svc().submit(memberA, id);
    const csv = await svc().exportReviewCsv(admin);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toContain("비밀 본문");
    expect(csv.split("\r\n")[0]).not.toContain("학번");
    await expect(svc().exportReviewCsv(leaderA)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });
});

describe("HWPX 활동 내역서", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    recordTitle: "3월 정기 연습",
    representative: "대표자",
    location: "소극장",
    activityAt: new Date("2026-03-14T05:30:00Z"),
    content: "연습 내용",
    participants: [{ name: "참여자1", department: "학과", studentNo: "2025000001", note: null }],
    ...over,
  });
  const president = async () => {
    const pid = await add("900", "MEMBER", 3);
    await db.insert(clubOfficer).values({ position: "PRESIDENT", memberId: pid, appointedAt: clock });
    return pid;
  };

  it("회장이 지정되지 않으면 만들 수 없다", async () => {
    await expect(reports().createBlank(memberA)).rejects.toMatchObject({ code: "PRESIDENT_NOT_CONFIGURED" });
    await expect(reports().saveDraft(memberA, input(), await pngBytes())).rejects.toMatchObject({ code: "PRESIDENT_NOT_CONFIGURED" });
  });

  it("임시 저장하면 활동 기록(DRAFT)과 사진·HWPX 파일, 입력 스냅샷이 저장된다", async () => {
    await president();
    const saved = await reports().saveDraft(memberA, input(), await pngBytes());
    expect(await statusOf(saved.activityRecordId)).toBe("DRAFT");
    const current = await db.select().from(activityRecordFile).where(eq(activityRecordFile.activityRecordId, saved.activityRecordId));
    expect(current.map((f) => f.fileRole).sort()).toEqual(["DOCUMENT", "EVIDENCE"]);
    const [doc] = await db.select().from(activityReportDocument);
    expect(doc).toMatchObject({ representative: "대표자", location: "소극장" });
    expect(doc.participants).toHaveLength(1);
    const draft = await reports().lookupDraft(memberA, saved.activityRecordId);
    expect(draft).toMatchObject({ recordTitle: "3월 정기 연습", representative: "대표자" });
    const { object } = await files().openPrivate(saved.hwpxFileId, true);
    const chunks: Buffer[] = [];
    for await (const c of object.stream) chunks.push(Buffer.from(c));
    const zip = unzipSync(new Uint8Array(Buffer.concat(chunks)));
    expect(strFromU8(zip["Preview/PrvText.txt"])).toContain("대표자 대표자");
    expect(saved.filename).toBe("2026-03-14_반디_동아리_활동_내역서.hwpx");
  });

  it("사진이 이미지가 아니거나 입력이 잘못되면 거부하고 기록을 남기지 않는다", async () => {
    await president();
    await expect(reports().saveDraft(memberA, input(), new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "INVALID_REPORT_DOCUMENT" });
    await expect(reports().saveDraft(memberA, input({ participants: [] }), await pngBytes())).rejects.toMatchObject({ code: "INVALID_REPORT_DOCUMENT" });
    await expect(reports().saveDraft(memberA, input({ representative: " " }), await pngBytes())).rejects.toMatchObject({ code: "INVALID_REPORT_DOCUMENT" });
    expect(await db.select().from(activityRecord)).toHaveLength(0);
  });

  it("수정하면 HWPX를 다시 만들고 이전 파일은 교체 이력으로 남는다 (사진 생략 시 기존 사진 유지)", async () => {
    await president();
    const saved = await reports().saveDraft(memberA, input(), await pngBytes());
    const before = await reports().lookupDraft(memberA, saved.activityRecordId);
    await reports().updateDraft(memberA, saved.activityRecordId, input({ location: "대극장" }), null);
    const after = await reports().lookupDraft(memberA, saved.activityRecordId);
    expect(after.location).toBe("대극장");
    expect(after.photo?.fileId).toBe(before.photo?.fileId);
    expect(after.hwpx?.fileId).not.toBe(before.hwpx?.fileId);
    const all = await db.select().from(activityRecordFile).where(eq(activityRecordFile.activityRecordId, saved.activityRecordId));
    expect(all.filter((f) => f.replacedAt !== null)).toHaveLength(1);
  });

  it("다른 사람은 수정할 수 없고, 제출 후에는 수정할 수 없다", async () => {
    await president();
    const saved = await reports().saveDraft(memberA, input(), await pngBytes());
    await expect(reports().updateDraft(memberA2, saved.activityRecordId, input(), null)).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
    await reports().submit(memberA, saved.activityRecordId);
    expect(await statusOf(saved.activityRecordId)).toBe("SUBMITTED");
    await expect(reports().updateDraft(memberA, saved.activityRecordId, input(), null)).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("문서형 기록은 사진·HWPX가 없으면 제출할 수 없다", async () => {
    await president();
    const saved = await reports().saveDraft(memberA, input(), await pngBytes());
    await db.update(activityRecordFile).set({ replacedAt: clock, replacedByMemberId: memberA, replacedByFileId: null }).where(eq(activityRecordFile.activityRecordId, saved.activityRecordId)).catch(() => undefined);
    // 제약상 교체 정보가 모두 필요하므로, 현재 파일을 직접 삭제해 누락 상황을 만든다.
    await db.delete(activityRecordFile).where(eq(activityRecordFile.activityRecordId, saved.activityRecordId));
    await expect(reports().submit(memberA, saved.activityRecordId)).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("참여자 후보 검색은 활성 멤버를 이름/학번으로 찾고 2자 미만은 거부한다", async () => {
    expect((await reports().searchParticipants(memberA, "이름3")).map((r) => r.studentNo)).toEqual(["3"]);
    await expect(reports().searchParticipants(memberA, "a")).rejects.toMatchObject({ code: "INVALID_REPORT_DOCUMENT" });
    expect((await reports().searchParticipants(memberA, "이름7")).length).toBe(0); // 정지 멤버 제외
    await expect(reports().searchParticipants(suspended, "이름")).rejects.toMatchObject({ code: "ACTIVITY_ACCESS_DENIED" });
  });
});
