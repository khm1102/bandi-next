import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member } from "@/features/member/schema";
import { fileRetirementQueue, storedFile } from "@/features/file/schema";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";
import { createProfilePhotoService } from "@/features/member/profile-photo";

let db: NodePgDatabase;
let root: string;
let storage: LocalFileStorage;
let a: number;
let b: number;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const files = () => createFileService({ db, storage, maxUploadBytes: 1024 * 1024 });
const exists = (p: string) => access(p).then(() => true, () => false);
const photo = (actorId: number) =>
  files().upload({
    kind: "profile-image",
    domain: "member-profile",
    file: {
      name: "p.png",
      size: PNG.length,
      stream: new ReadableStream({
        start(c) {
          c.enqueue(PNG);
          c.close();
        },
      }),
    },
    actorId,
  });

async function add(studentNo: string) {
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
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-pp-"));
  storage = new LocalFileStorage(root);
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  a = await add("1");
  b = await add("2");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("프로필 사진", () => {
  it("본인이 올린 프로필 이미지를 연결한다", async () => {
    const ref = await photo(a);
    await createProfilePhotoService({ db, files: files() }).set(a, ref.id);
    expect((await db.select().from(member).where(eq(member.id, a)))[0].profilePhotoFileId).toBe(ref.id);
  });

  it("타인이 올린 파일은 연결할 수 없다", async () => {
    const ref = await photo(b);
    await expect(createProfilePhotoService({ db, files: files() }).set(a, ref.id)).rejects.toMatchObject({ code: "FI003" });
    expect((await db.select().from(member).where(eq(member.id, a)))[0].profilePhotoFileId).toBeNull();
  });

  it("교체하면 이전 파일은 FK 해제 후 파기 대기열에 오르고, 실행하면 원본이 완전히 사라진다", async () => {
    const first = await photo(a);
    const svc = createProfilePhotoService({ db, files: files() });
    await svc.set(a, first.id);
    const [firstRow] = await db.select().from(storedFile).where(eq(storedFile.id, first.id));
    const firstPath = storage.resolve("PRIVATE", firstRow.storageKey);
    const second = await photo(a);
    await svc.set(a, second.id);
    expect((await db.select().from(fileRetirementQueue))[0]).toMatchObject({ storedFileId: first.id, status: "PENDING", reason: "PROFILE_PHOTO" });
    await files().runRetirements();
    expect(await exists(firstPath)).toBe(false);
    expect((await db.select().from(storedFile).where(eq(storedFile.id, first.id)))).toHaveLength(0);
    expect((await db.select().from(member).where(eq(member.id, a)))[0].profilePhotoFileId).toBe(second.id);
  });

  it("삭제하면 연결이 해제되고 원본이 파기된다", async () => {
    const ref = await photo(a);
    const svc = createProfilePhotoService({ db, files: files() });
    await svc.set(a, ref.id);
    await svc.remove(a);
    expect(await svc.currentPhotoFileId(a)).toBeNull();
    expect(await files().runRetirements()).toEqual({ deleted: 1, failed: 0 });
  });
});
