import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { LocalFileStorage } from "@/features/file/storage";
import { inspectUpload, saveToTemp, type TempUpload } from "@/features/file/inspector";

let root: string;
let storage: LocalFileStorage;
const MAX = 1024 * 1024;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bandi-files-"));
  storage = new LocalFileStorage(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

async function upload(bytes: Uint8Array, max = MAX): Promise<TempUpload> {
  return saveToTemp(storage, streamOf(bytes), max);
}

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const inspect = async (name: string, bytes: Uint8Array, kind: "general" | "profile-image" | "notice-image" = "general") => {
  const u = await upload(bytes);
  return inspectUpload(name, bytes.length, u, { kind, maxUploadBytes: MAX });
};

describe("LocalFileStorage 경로 안전", () => {
  it.each(["../escape", "a/../../escape", "/etc/passwd", "..", ".", "", "a\0b", "..\\escape"])(
    "위험한 키 %j 는 거부한다",
    (key) => {
      expect(() => storage.resolve("PRIVATE", key)).toThrow();
    },
  );

  it("정상 키는 scope 디렉터리 아래로 해석된다", () => {
    const resolved = storage.resolve("PRIVATE", "resource/2026/11/abc");
    expect(resolved.startsWith(path.join(root, "private") + path.sep)).toBe(true);
    expect(storage.resolve("PUBLIC", "x/y").startsWith(path.join(root, "public") + path.sep)).toBe(true);
  });

  it("임시 파일을 원자적으로 이동하고 읽고 복사하고 삭제한다", async () => {
    const tmp = await storage.newTempPath();
    await writeFile(tmp, "hello");
    await storage.commit(tmp, "PRIVATE", "resource/2026/11/a");
    const { stream, sizeBytes } = await storage.open("PRIVATE", "resource/2026/11/a");
    expect(sizeBytes).toBe(5);
    stream.destroy();
    await storage.copy("PRIVATE", "resource/2026/11/a", "PUBLIC", "resource/2026/11/b");
    expect(await readFile(storage.resolve("PUBLIC", "resource/2026/11/b"), "utf8")).toBe("hello");
    await storage.remove("PRIVATE", "resource/2026/11/a");
    await expect(storage.open("PRIVATE", "resource/2026/11/a")).rejects.toBeDefined();
  });
});

describe("saveToTemp", () => {
  it("해시와 시그니처를 계산한다", async () => {
    const u = await upload(png());
    expect(u.sizeBytes).toBe(40);
    expect(u.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(u.signature[0]).toBe(0x89);
  });

  it("빈 파일과 한도 초과는 거부하고 임시 파일을 남기지 않는다", async () => {
    await expect(upload(new Uint8Array(0))).rejects.toMatchObject({ code: "FI001" });
    await expect(upload(Buffer.alloc(2048), 1024)).rejects.toMatchObject({ code: "FI002" });
  });
});

describe("inspectUpload", () => {
  it("이미지·문서 시그니처가 확장자와 맞으면 서버가 판정한 타입을 반환한다", async () => {
    expect((await inspect("a.png", png())).contentType).toBe("image/png");
    expect((await inspect("A.JPG", jpg())).contentType).toBe("image/jpeg");
    expect((await inspect("a.webp", Buffer.from("RIFF0000WEBPxxxxxxxx"))).contentType).toBe("image/webp");
    expect((await inspect("a.pdf", Buffer.from("%PDF-1.7 rest"))).contentType).toBe("application/pdf");
    expect((await inspect("a.mp4", Buffer.from("0000ftypisom0000"))).contentType).toBe("video/mp4");
  });

  it("확장자와 내용이 다르면 거부한다 (png 이름의 jpg 내용)", async () => {
    await expect(inspect("a.png", jpg())).rejects.toMatchObject({ reason: "signature-mismatch" });
    await expect(inspect("a.pdf", png())).rejects.toMatchObject({ reason: "signature-mismatch" });
  });

  it.each(["noext", ".hidden", "a.", "a.exe", "a.html", "a.svg", "a/b.png", "a\\b.png", "a\u0000.png", ""])(
    "허용되지 않는 파일 이름 %j 는 거부한다",
    async (name) => {
      await expect(inspect(name, png())).rejects.toMatchObject({ code: "FI001" });
    },
  );

  it("docx/xlsx는 ZIP 구조(Content_Types + word/·xl/)를 검증한다", async () => {
    const docx = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "word/document.xml": strToU8("<d/>") });
    expect((await inspect("a.docx", docx)).contentType).toContain("wordprocessingml");
    const xlsx = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "xl/workbook.xml": strToU8("<w/>") });
    expect((await inspect("a.xlsx", xlsx)).contentType).toContain("spreadsheetml");
    await expect(inspect("a.docx", xlsx)).rejects.toMatchObject({ reason: "invalid-office-file" });
    await expect(inspect("a.docx", Buffer.from("not a zip at all"))).rejects.toMatchObject({ reason: "invalid-office-file" });
  });

  it("hwpx는 mimetype·content.hpf·section XML을 모두 요구한다", async () => {
    const good = zipSync({
      mimetype: strToU8("application/hwp+zip"),
      "Contents/content.hpf": strToU8("<p/>"),
      "Contents/section0.xml": strToU8("<s/>"),
    });
    expect((await inspect("a.hwpx", good)).contentType).toBe("application/hwp+zip");
    const wrongMime = zipSync({
      mimetype: strToU8("text/plain"),
      "Contents/content.hpf": strToU8("<p/>"),
      "Contents/section0.xml": strToU8("<s/>"),
    });
    await expect(inspect("a.hwpx", wrongMime)).rejects.toMatchObject({ reason: "invalid-hwpx-file" });
    const noSection = zipSync({ mimetype: strToU8("application/hwp+zip"), "Contents/content.hpf": strToU8("<p/>") });
    await expect(inspect("a.hwpx", noSection)).rejects.toMatchObject({ reason: "invalid-hwpx-file" });
  });

  it("프로필 이미지는 이미지 확장자만, 5MiB 이하만 허용한다", async () => {
    expect((await inspect("p.png", png(), "profile-image")).contentType).toBe("image/png");
    await expect(inspect("p.pdf", Buffer.from("%PDF-1.7"), "profile-image")).rejects.toMatchObject({ reason: "unsupported-profile-image-extension" });
    const big = Buffer.concat([png(), Buffer.alloc(5 * 1024 * 1024)]);
    const u = await saveToTemp(storage, streamOf(big), 20 * 1024 * 1024);
    await expect(inspectUpload("p.png", big.length, u, { kind: "profile-image", maxUploadBytes: 20 * 1024 * 1024 })).rejects.toMatchObject({ code: "FI002" });
  });

  it("선언 크기가 실제와 다르면 거부한다", async () => {
    const u = await upload(png());
    await expect(inspectUpload("a.png", 999, u, { kind: "general", maxUploadBytes: MAX })).rejects.toMatchObject({ reason: "declared-size-mismatch" });
  });
});
