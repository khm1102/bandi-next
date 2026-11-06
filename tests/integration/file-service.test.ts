import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member } from "@/features/member/schema";
import { fileRetirementQueue, storedFile } from "@/features/file/schema";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";

let db: NodePgDatabase;
let root: string;
let storage: LocalFileStorage;
let owner: number;
let other: number;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
const svc = () => createFileService({ db, storage, maxUploadBytes: 1024 * 1024, now: () => new Date("2026-11-07T00:00:00Z") });
const exists = (p: string) => access(p).then(() => true, () => false);

async function addMember(studentNo: string) {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({ studentNo, name: studentNo, teamId: 3, cohortId: c.id, role: "MEMBER", status: "ACTIVE", ssoLinkStatus: "LINKED" })
    .returning({ id: member.id });
  return row.id;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-fs-"));
  storage = new LocalFileStorage(root);
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  owner = await addMember("1");
  other = await addMember("2");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("파일 업로드", () => {
  it("검증을 통과하면 READY 메타데이터와 private 저장소 파일이 생긴다", async () => {
    const ref = await svc().upload({ kind: "general", domain: "resource", file: { name: "a.png", size: PNG.length, stream: stream(PNG) }, actorId: owner });
    expect(ref).toMatchObject({ originalName: "a.png", contentType: "image/png", storageScope: "PRIVATE", purpose: "GENERAL" });
    const [row] = await db.select().from(storedFile).where(eq(storedFile.id, ref.id));
    expect(row.uploadStatus).toBe("READY");
    expect(row.storageKey).toMatch(/^resource\/2026\/11\/[0-9a-f-]{36}$/);
    expect((await readFile(storage.resolve("PRIVATE", row.storageKey))).length).toBe(PNG.length);
  });

  it("거부된 파일은 메타데이터와 임시 파일을 남기지 않는다", async () => {
    await expect(
      svc().upload({ kind: "general", domain: "resource", file: { name: "a.png", size: 3, stream: stream(Buffer.from("abc")) }, actorId: owner }),
    ).rejects.toMatchObject({ code: "FI001" });
    expect(await db.select().from(storedFile)).toHaveLength(0);
    expect(await exists(path.join(root, "tmp"))).toBe(true);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(path.join(root, "tmp"))).toHaveLength(0);
  });

  it("프로필 이미지는 PROFILE_IMAGE 목적으로 저장되어 일반 첨부로 쓸 수 없다", async () => {
    const ref = await svc().upload({ kind: "profile-image", domain: "member-profile", file: { name: "p.png", size: PNG.length, stream: stream(PNG) }, actorId: owner });
    expect(ref.purpose).toBe("PROFILE_IMAGE");
    await expect(svc().lookupPrivateReady(ref.id)).rejects.toMatchObject({ code: "FI005" });
    await expect(svc().assertProfileImageOwnedBy(ref.id, owner)).resolves.toBeDefined();
    await expect(svc().assertProfileImageOwnedBy(ref.id, other)).rejects.toMatchObject({ code: "FI003" });
  });
});

describe("접근 통제", () => {
  async function uploaded() {
    return svc().upload({ kind: "general", domain: "resource", file: { name: "a.png", size: PNG.length, stream: stream(PNG) }, actorId: owner });
  }

  it("업로더만 다른 도메인에 연결할 수 있다 (타인의 파일 ID 거부)", async () => {
    const ref = await uploaded();
    await expect(svc().assertPrivateReadyOwnedBy(ref.id, owner)).resolves.toBeDefined();
    await expect(svc().assertPrivateReadyOwnedBy(ref.id, other)).rejects.toMatchObject({ code: "FI003" });
  });

  it("권한 판단이 granted=false이면 열지 않는다", async () => {
    const ref = await uploaded();
    await expect(svc().openPrivate(ref.id, false)).rejects.toMatchObject({ code: "FI003" });
    const { object } = await svc().openPrivate(ref.id, true);
    object.stream.destroy();
  });

  it("없는 파일은 not-found, public 파일은 private 경로로 열 수 없다", async () => {
    await expect(svc().openPrivate(999999, true)).rejects.toMatchObject({ code: "FI004" });
    const ref = await uploaded();
    const publicId = await svc().promoteToPublic(owner, ref.id, "resource");
    await expect(svc().openPrivate(publicId, true)).rejects.toMatchObject({ code: "FI005" });
    const { file, object } = await svc().openPublic(publicId);
    object.stream.destroy();
    expect(file.storageScope).toBe("PUBLIC");
  });

  it("공개 승격은 업로더 본인의 private 파일만 가능하다", async () => {
    const ref = await uploaded();
    await expect(svc().promoteToPublic(other, ref.id, "resource")).rejects.toMatchObject({ code: "FI003" });
  });
});

describe("파기 대기열", () => {
  it("객체와 메타데이터를 지우고 큐 행은 DELETED로 남긴다", async () => {
    const ref = await svc().upload({ kind: "general", domain: "resource", file: { name: "a.png", size: PNG.length, stream: stream(PNG) }, actorId: owner });
    const [row] = await db.select().from(storedFile).where(eq(storedFile.id, ref.id));
    const objectPath = storage.resolve("PRIVATE", row.storageKey);
    await db.transaction((tx) => svc().enqueueRetirement(tx, ref.id, "PROFILE_PHOTO"));
    expect(await svc().runRetirements()).toEqual({ deleted: 1, failed: 0 });
    expect(await exists(objectPath)).toBe(false);
    expect(await db.select().from(storedFile)).toHaveLength(0);
    const [queued] = await db.select().from(fileRetirementQueue);
    expect(queued).toMatchObject({ status: "DELETED", storedFileId: ref.id });
    expect(queued.completedAt).not.toBeNull();
    expect(await svc().runRetirements()).toEqual({ deleted: 0, failed: 0 });
  });

  it("같은 파일을 두 번 올려도 큐에는 한 건만 남는다", async () => {
    const ref = await svc().upload({ kind: "general", domain: "resource", file: { name: "a.png", size: PNG.length, stream: stream(PNG) }, actorId: owner });
    await db.transaction((tx) => svc().enqueueRetirement(tx, ref.id, "LINK_PREVIEW_IMAGE"));
    await db.transaction((tx) => svc().enqueueRetirement(tx, ref.id, "LINK_PREVIEW_IMAGE"));
    expect(await db.select().from(fileRetirementQueue)).toHaveLength(1);
  });
});
