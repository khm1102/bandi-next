import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { closeTestDb, resetData, testDb } from "./helpers";
import { cohort, member } from "@/features/member/schema";
import { fileRetirementQueue, storedFile } from "@/features/file/schema";
import { resource, resourceLinkPreview } from "@/features/resource/schema";
import { createResourceService } from "@/features/resource/service";
import { createFileService } from "@/features/file/service";
import { LocalFileStorage } from "@/features/file/storage";
import { urlHash, type LinkPreview } from "@/features/resource/link-preview";

let db: NodePgDatabase;
let root: string;
let admin: number, leader: number, author: number, other: number, suspended: number;
let fetched: string[][] = [];

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const PDF = Buffer.from("%PDF-1.7 content");
const files = () => createFileService({ db, storage: new LocalFileStorage(root), maxUploadBytes: 1024 * 1024 });
const fakePreview = (url: string, withImage = false): LinkPreview => ({
  normalizedUrl: url,
  urlHash: urlHash(url),
  domain: new URL(url).hostname,
  title: `제목 ${url}`,
  description: "설명",
  image: withImage ? { bytes: PNG, contentType: "image/png" } : null,
});
const svc = (withImage = false) =>
  createResourceService({
    db,
    files: files(),
    fetchPreviews: async (urls) => {
      fetched.push(urls);
      return urls.map((u) => fakePreview(u, withImage));
    },
  });
const input = (over: Record<string, unknown> = {}) => ({ title: "자료", body: "본문", attachmentFileIds: [] as number[], ...over });

async function add(studentNo: string, role: string, teamId: number, status = "ACTIVE") {
  const [c] = await db.select().from(cohort).limit(1);
  const [row] = await db
    .insert(member)
    .values({ studentNo, name: `이름${studentNo}`, teamId, cohortId: c.id, role, status, ssoLinkStatus: "LINKED" })
    .returning({ id: member.id });
  return row.id;
}
async function upload(actorId: number, name: string, bytes: Buffer) {
  return (
    await files().upload({
      kind: "general",
      domain: "resource",
      file: { name, size: bytes.length, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) },
      actorId,
    })
  ).id;
}

beforeAll(async () => {
  db = await testDb();
});
afterAll(closeTestDb);
beforeEach(async () => {
  fetched = [];
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-res-"));
  await resetData(db);
  await db.insert(cohort).values({ name: "1-1" });
  admin = await add("1", "ADMIN", 3);
  leader = await add("2", "LEADER", 3);
  author = await add("3", "MEMBER", 3);
  other = await add("4", "MEMBER", 4);
  suspended = await add("5", "MEMBER", 3, "SUSPENDED");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("권한", () => {
  it("모든 활성 멤버가 작성·열람하고 비활성 멤버는 거부한다", async () => {
    const id = await svc().create(author, input());
    await expect(svc().lookup(other, id)).resolves.toMatchObject({ title: "자료", canManage: false });
    await expect(svc().create(suspended, input())).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await expect(svc().lookup(suspended, id)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await expect(svc().search(suspended)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
  });

  it("수정·삭제는 작성자와 ADMIN만, LEADER 권한만으로는 타인의 자료를 관리할 수 없다", async () => {
    const id = await svc().create(author, input());
    await expect(svc().update(other, id, input({ title: "탈취" }))).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await expect(svc().update(leader, id, input({ title: "팀장" }))).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await expect(svc().delete(leader, id)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await svc().update(author, id, input({ title: "작성자 수정" }));
    await svc().update(admin, id, input({ title: "운영진 수정" }));
    expect((await svc().lookup(author, id)).title).toBe("운영진 수정");
    expect((await svc().lookup(admin, id)).canManage).toBe(true);
    expect((await svc().lookup(leader, id)).canManage).toBe(false);
  });

  it("삭제는 소프트 삭제이며 이후 조회·수정이 404다", async () => {
    const id = await svc().create(author, input());
    await svc().delete(author, id);
    await expect(svc().lookup(author, id)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(svc().update(admin, id, input())).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const [row] = await db.select().from(resource).where(eq(resource.id, id));
    expect(row.deletedAt).not.toBeNull();
  });

  it("빈 제목·긴 제목·빈 본문을 거부한다", async () => {
    await expect(svc().create(author, input({ title: " " }))).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    await expect(svc().create(author, input({ title: "가".repeat(201) }))).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    await expect(svc().create(author, input({ body: "  " }))).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
  });
});

describe("검색", () => {
  it("제목·본문·작성자 이름으로 검색하고 최신 수정 순으로 정렬한다", async () => {
    const a = await svc().create(author, input({ title: "대본 모음", body: "alpha" }));
    const b = await svc().create(other, input({ title: "소품 목록", body: "beta" }));
    expect((await svc().search(admin)).items.map((i) => i.id)).toEqual([b, a]);
    expect((await svc().search(admin, { keyword: "대본" })).items.map((i) => i.id)).toEqual([a]);
    expect((await svc().search(admin, { keyword: "beta" })).items.map((i) => i.id)).toEqual([b]);
    expect((await svc().search(admin, { keyword: "이름4" })).items.map((i) => i.id)).toEqual([b]);
    expect((await svc().search(admin, { keyword: "%" })).total).toBe(0);
  });
});

describe("첨부", () => {
  it("본인이 올린 파일만 연결하고 타인의 파일 ID는 거부한다", async () => {
    const mine = await upload(author, "a.pdf", PDF);
    const others = await upload(other, "b.pdf", PDF);
    await expect(svc().create(author, input({ attachmentFileIds: [others] }))).rejects.toMatchObject({ code: "FI003" });
    const id = await svc().create(author, input({ attachmentFileIds: [mine] }));
    expect((await svc().lookup(other, id)).attachments.map((a) => a.id)).toEqual([mine]);
  });

  it("관리자가 수정해도 기존 첨부는 유지되고 새 첨부는 수정자 소유여야 한다", async () => {
    const original = await upload(author, "a.pdf", PDF);
    const id = await svc().create(author, input({ attachmentFileIds: [original] }));
    const adminFile = await upload(admin, "b.pdf", PDF);
    await svc().update(admin, id, input({ attachmentFileIds: [original, adminFile] }));
    expect((await svc().lookup(author, id)).attachments).toHaveLength(2);
    const authorFile = await upload(author, "c.pdf", PDF);
    await expect(svc().update(admin, id, input({ attachmentFileIds: [original, authorFile] }))).rejects.toMatchObject({ code: "FI003" });
  });

  it("첨부는 열람 가능한 자료의 것만 열린다 (다른 자료 경로·삭제된 자료 거부)", async () => {
    const fileA = await upload(author, "a.pdf", PDF);
    const idA = await svc().create(author, input({ attachmentFileIds: [fileA] }));
    const idB = await svc().create(other, input());
    const opened = await svc().openFile(admin, idA, fileA);
    opened.object.stream.destroy();
    await expect(svc().openFile(admin, idB, fileA)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(svc().openFile(suspended, idA, fileA)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await svc().delete(author, idA);
    await expect(svc().openFile(admin, idA, fileA)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("본문 이미지는 첨부된 이미지만 참조하고 외부 이미지는 렌더링하지 않는다", async () => {
    const img = await upload(author, "p.png", PNG);
    const pdf = await upload(author, "d.pdf", PDF);
    await expect(svc().create(author, input({ body: `![x](attachment://${img})` }))).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    await expect(svc().create(author, input({ body: `![x](attachment://${pdf})`, attachmentFileIds: [pdf] }))).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    const id = await svc().create(author, input({ body: `![x](attachment://${img})\n![외부](https://example.com/a.png)`, attachmentFileIds: [img] }));
    const html = (await svc().lookup(other, id)).html.value;
    expect(html).toContain(`/api/resources/${id}/files/${img}/inline`);
    expect(html).not.toContain("example.com/a.png");
  });
});

describe("링크 카드", () => {
  it("단독 줄 HTTPS URL만 수집하고 최대 5개로 제한한다", async () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://site${i}.example.com/p`);
    const id = await svc().create(author, input({ body: `설명\n${urls.join("\n")}\n문장 속 https://inline.example.com/x 링크` }));
    expect(fetched[0]).toHaveLength(5);
    const detail = await svc().lookup(other, id);
    expect(detail.previews.map((p) => p.url)).toEqual(urls.slice(0, 5));
    expect(detail.previews[0]).toMatchObject({ domain: "site0.example.com", description: "설명" });
  });

  it("수정 시 이미 수집한 URL은 다시 요청하지 않고 제거된 URL의 카드와 이미지는 파기한다", async () => {
    const id = await svc(true).create(author, input({ body: "https://a.example.com/x\nhttps://b.example.com/y" }));
    expect(await db.select().from(resourceLinkPreview)).toHaveLength(2);
    expect((await db.select().from(storedFile)).length).toBe(2);
    fetched = [];
    await svc(true).update(author, id, input({ body: "https://a.example.com/x\n본문 변경" }));
    expect(fetched).toEqual([]);
    const remaining = await db.select().from(resourceLinkPreview);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].domain).toBe("a.example.com");
    expect((await db.select().from(fileRetirementQueue))[0]).toMatchObject({ status: "DELETED", reason: "LINK_PREVIEW_IMAGE" });
    expect(await db.select().from(storedFile)).toHaveLength(1);
  });

  it("수집에 실패해도 자료 저장은 성공한다", async () => {
    const failing = createResourceService({ db, files: files(), fetchPreviews: async () => { throw new Error("network"); } });
    const id = await failing.create(author, input({ body: "https://down.example.com/" }));
    expect((await failing.lookup(author, id)).previews).toEqual([]);
  });

  it("내부 주소 URL은 수집 대상에서 제외된다", async () => {
    await svc().create(author, input({ body: "https://127.0.0.1/admin\nhttps://169.254.169.254/latest/meta-data" }));
    expect(fetched).toEqual([]);
  });

  it("대표 이미지는 해당 자료의 링크 카드 이미지로만 열린다", async () => {
    const id = await svc(true).create(author, input({ body: "https://a.example.com/x" }));
    const [preview] = await db.select().from(resourceLinkPreview);
    const imageId = preview.previewImageFileId!;
    const opened = await svc().openPreviewImage(other, id, imageId);
    opened.object.stream.destroy();
    const otherId = await svc().create(other, input());
    await expect(svc().openPreviewImage(other, otherId, imageId)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("제목 공개 링크", () => {
  it("작성자·ADMIN만 발급하고 일반 멤버·LEADER는 발급할 수 없다", async () => {
    const id = await svc().create(author, input());
    await expect(svc().issueShare(other, id)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    await expect(svc().issueShare(leader, id)).rejects.toMatchObject({ code: "RESOURCE_ACCESS_DENIED" });
    const token = await svc().issueShare(author, id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(svc().issueShare(admin, id)).resolves.toBeDefined();
  });

  it("제목만 공개하고 재발급·중단·삭제하면 이전 링크는 404다", async () => {
    const id = await svc().create(author, input({ title: "공개 제목", body: "비밀" }));
    const first = await svc().issueShare(author, id);
    expect(await svc().lookupPublicShare(first)).toEqual({ id, title: "공개 제목" });
    const second = await svc().issueShare(author, id);
    await expect(svc().lookupPublicShare(first)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await svc().revokeShare(author, id);
    await expect(svc().lookupPublicShare(second)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const third = await svc().issueShare(author, id);
    await svc().delete(author, id);
    await expect(svc().lookupPublicShare(third)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(svc().lookupPublicShare("short")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
