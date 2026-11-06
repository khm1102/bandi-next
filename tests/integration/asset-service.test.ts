import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { auditLog } from "@/features/audit/schema";
import { cohort, member } from "@/features/member/schema";
import { assetHistory, assetUnit } from "@/features/asset/schema";
import { createAssetService } from "@/features/asset/service";
import { actionForStatus } from "@/features/asset/model";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";

let db: NodePgDatabase;
let root: string;
let admin: number, leader: number, memberA: number, suspended: number;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const PDF = Buffer.from("%PDF-1.7 doc");
const files = () => createFileService({ db, storage: new LocalFileStorage(root), maxUploadBytes: 1024 * 1024 });
const svc = () => createAssetService({ db, files: files(), now: () => new Date("2026-11-07T00:00:00Z") });
const item = (over: Record<string, unknown> = {}) => ({
  name: "소품",
  category: "PROP",
  trackingType: "QUANTITY",
  ownerType: "CLUB" as const,
  ownerMemberId: null as number | null,
  externalOwnerName: null as string | null,
  totalQuantity: 5,
  storageLocation: "창고 A",
  note: null as string | null,
  ...over,
});

async function add(studentNo: string, role: string, status = "ACTIVE") {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db.insert(member).values({ studentNo, name: `이름${studentNo}`, teamId: 3, cohortId: c.id, role, status, ssoLinkStatus: "LINKED" }).returning({ id: member.id });
  return row.id;
}
async function upload(actorId: number, name: string, bytes: Buffer) {
  return (await files().upload({ kind: "general", domain: "asset", file: { name, size: bytes.length, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) }, actorId })).id;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-asset-"));
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  admin = await add("1", "ADMIN");
  leader = await add("2", "LEADER");
  memberA = await add("3", "MEMBER");
  suspended = await add("4", "ADMIN", "SUSPENDED");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("권한", () => {
  it("등록·수정·삭제·복구·상태 변경은 활성 ADMIN만 가능하다", async () => {
    const id = await svc().registerItem(admin, item());
    for (const actor of [leader, memberA, suspended]) {
      await expect(svc().registerItem(actor, item())).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
      await expect(svc().updateItem(actor, id, item())).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
      await expect(svc().deleteItem(actor, id)).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
      await expect(svc().changeItemStatus(actor, id, "REPAIR")).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
      await expect(svc().registerUnit(actor, id, { managementNo: "x", storageLocation: "y" })).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
    }
  });

  it("조회는 활성 멤버 전체, 삭제된 목록은 ADMIN만 볼 수 있다", async () => {
    const id = await svc().registerItem(admin, item());
    expect((await svc().searchItems(memberA)).total).toBe(1);
    await expect(svc().lookupItem(memberA, id)).resolves.toMatchObject({ name: "소품" });
    await expect(svc().searchItems(memberA, { deleted: true })).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
    await expect(svc().searchItems(suspended)).rejects.toMatchObject({ code: "ASSET_ACCESS_DENIED" });
  });
});

describe("품목 검증", () => {
  it("소유 유형과 소유 정보가 맞지 않으면 거부한다", async () => {
    await expect(svc().registerItem(admin, item({ ownerType: "CLUB", externalOwnerName: "외부" }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ ownerType: "MEMBER" }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ ownerType: "MEMBER", ownerMemberId: 99999 }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ ownerType: "EXTERNAL" }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ ownerType: "MEMBER", ownerMemberId: memberA }))).resolves.toBeGreaterThan(0);
    await expect(svc().registerItem(admin, item({ ownerType: "EXTERNAL", externalOwnerName: "극단 X" }))).resolves.toBeGreaterThan(0);
  });

  it("이름·수량·관리 방식 검증", async () => {
    await expect(svc().registerItem(admin, item({ name: " " }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ totalQuantity: 0 }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(svc().registerItem(admin, item({ trackingType: "BULK" }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
  });

  it("사진은 본인이 올린 이미지만 연결할 수 있다", async () => {
    const mine = await upload(admin, "p.png", PNG);
    const others = await upload(leader, "q.png", PNG);
    const pdf = await upload(admin, "d.pdf", PDF);
    await expect(svc().registerItem(admin, item({ photoFileId: others }))).rejects.toMatchObject({ code: "FI003" });
    await expect(svc().registerItem(admin, item({ photoFileId: pdf }))).rejects.toMatchObject({ code: "INVALID_ASSET" });
    const id = await svc().registerItem(admin, item({ photoFileId: mine }));
    const photo = await svc().openPhoto(memberA, id);
    photo.object.stream.destroy();
    const noPhoto = await svc().registerItem(admin, item());
    await expect(svc().openPhoto(memberA, noPhoto)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });
});

describe("이력", () => {
  it("등록·수량 조정·위치 이동·상태 변경이 이력으로 남는다", async () => {
    const id = await svc().registerItem(admin, item());
    await svc().updateItem(admin, id, item({ totalQuantity: 8, storageLocation: "창고 B" }));
    await svc().changeItemStatus(admin, id, "LOANED", "대여");
    await svc().changeItemStatus(admin, id, "AVAILABLE", "반납");
    await svc().changeItemStatus(admin, id, "AVAILABLE");
    const actions = (await svc().searchHistories(memberA, id)).map((h) => h.action);
    expect(actions).toEqual(["REGISTER", "ADJUST", "MOVE", "LOAN", "RETURN"]);
    const adjust = (await svc().searchHistories(memberA, id)).find((h) => h.action === "ADJUST");
    expect(adjust?.quantity).toBe(3);
  });

  it("상태 변화에 따른 행위 매핑", () => {
    expect(actionForStatus("AVAILABLE", "REPAIR")).toBe("REPAIR");
    expect(actionForStatus("AVAILABLE", "LOST")).toBe("LOST");
    expect(actionForStatus("IN_USE", "DISPOSED")).toBe("DISPOSE");
    expect(actionForStatus("LOANED", "AVAILABLE")).toBe("RETURN");
    expect(actionForStatus("AVAILABLE", "IN_USE")).toBe("LOAN");
    expect(actionForStatus("REPAIR", "AVAILABLE")).toBe("DAMAGE");
  });

  it("잘못된 상태 값을 거부한다", async () => {
    const id = await svc().registerItem(admin, item());
    await expect(svc().changeItemStatus(admin, id, "BROKEN")).rejects.toMatchObject({ code: "INVALID_ASSET" });
  });
});

describe("개별 장비", () => {
  it("개별 관리 품목에만 등록하고 관리번호는 품목 안에서 유일하다", async () => {
    const quantity = await svc().registerItem(admin, item());
    await expect(svc().registerUnit(admin, quantity, { managementNo: "A-1", storageLocation: "x" })).rejects.toMatchObject({ code: "INVALID_ASSET" });
    const individual = await svc().registerItem(admin, item({ trackingType: "INDIVIDUAL", totalQuantity: 2 }));
    const unit = await svc().registerUnit(admin, individual, { managementNo: "A-1", storageLocation: "x" });
    await expect(svc().registerUnit(admin, individual, { managementNo: "A-1", storageLocation: "y" })).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await svc().updateUnit(admin, unit, { status: "REPAIR", storageLocation: "수리점" }, "고장");
    const [row] = await db.select().from(assetUnit).where(eq(assetUnit.id, unit));
    expect(row).toMatchObject({ status: "REPAIR", storageLocation: "수리점" });
    expect((await svc().searchHistories(memberA, individual)).map((h) => h.action)).toEqual(["REGISTER", "REGISTER", "REPAIR", "MOVE"]);
    expect(await svc().searchUnits(memberA, individual)).toHaveLength(1);
  });
});

describe("소프트 삭제와 복구", () => {
  it("삭제하면 일반 조회에서 제외되고 ADMIN의 삭제됨 목록에서 복구할 수 있다", async () => {
    const individual = await svc().registerItem(admin, item({ trackingType: "INDIVIDUAL" }));
    await svc().registerUnit(admin, individual, { managementNo: "A-1", storageLocation: "x" });
    await svc().deleteItem(admin, individual);
    expect((await svc().searchItems(memberA)).total).toBe(0);
    await expect(svc().lookupItem(memberA, individual)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    await expect(svc().searchUnits(memberA, individual)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    await expect(svc().updateItem(admin, individual, item())).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    expect((await svc().searchItems(admin, { deleted: true })).items.map((i) => i.id)).toEqual([individual]);

    await svc().restoreItem(admin, individual);
    expect((await svc().searchItems(memberA)).total).toBe(1);
    expect(await svc().searchUnits(memberA, individual)).toHaveLength(1); // 개별 장비는 보존
    expect((await db.select().from(assetHistory)).map((h) => h.action)).toEqual(expect.arrayContaining(["DELETE", "RESTORE"]));
    expect((await db.select().from(auditLog)).map((a) => a.action).sort()).toEqual(["ASSET_DELETED", "ASSET_RESTORED"]);
  });

  it("삭제되지 않은 품목은 복구할 수 없다", async () => {
    const id = await svc().registerItem(admin, item());
    await expect(svc().restoreItem(admin, id)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });
});

describe("검색", () => {
  it("이름·분류·상태·관리 방식으로 필터링하고 이름순으로 정렬한다", async () => {
    await svc().registerItem(admin, item({ name: "마이크", category: "EQUIPMENT", trackingType: "INDIVIDUAL" }));
    await svc().registerItem(admin, item({ name: "가면", category: "PROP" }));
    const repair = await svc().registerItem(admin, item({ name: "조명", category: "EQUIPMENT" }));
    await svc().changeItemStatus(admin, repair, "REPAIR");
    expect((await svc().searchItems(memberA)).items.map((i) => i.name)).toEqual(["가면", "마이크", "조명"]);
    expect((await svc().searchItems(memberA, { keyword: "마이" })).total).toBe(1);
    expect((await svc().searchItems(memberA, { category: "EQUIPMENT" })).total).toBe(2);
    expect((await svc().searchItems(memberA, { status: "REPAIR" })).items.map((i) => i.name)).toEqual(["조명"]);
    expect((await svc().searchItems(memberA, { trackingType: "INDIVIDUAL" })).total).toBe(1);
    expect((await svc().searchItems(memberA, { keyword: "%" })).total).toBe(0);
  });
});
