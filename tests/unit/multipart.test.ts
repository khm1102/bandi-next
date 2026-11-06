import { describe, expect, it } from "vitest";
import { readSingleFile } from "@/lib/multipart";
import { saveToTemp } from "@/features/file/inspector";
import { LocalFileStorage } from "@/features/file/storage";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

const post = (form: FormData) => new Request("http://localhost/api/x", { method: "POST", body: form });
const read = async (stream: ReadableStream<Uint8Array>) => Buffer.from(await new Response(stream).arrayBuffer());

describe("readSingleFile (스트리밍 multipart)", () => {
  it("파일 파트를 스트림으로 꺼내 원본 바이트를 그대로 전달한다", async () => {
    const form = new FormData();
    form.set("other", "x");
    form.set("file", new File([Buffer.from("hello world")], "a.txt", { type: "text/plain" }));
    const file = await readSingleFile(post(form), 1024);
    expect(file.name).toBe("a.txt");
    expect((await read(file.stream)).toString()).toBe("hello world");
  });

  it("한글 파일명을 보존한다", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("x")], "활동 사진.png"));
    expect((await readSingleFile(post(form), 1024)).name).toBe("활동 사진.png");
  });

  it("파일이 없거나 multipart가 아니면 거부한다", async () => {
    const form = new FormData();
    form.set("a", "b");
    await expect(readSingleFile(post(form), 1024)).rejects.toMatchObject({ code: "FI001" });
    const json = new Request("http://localhost/x", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    await expect(readSingleFile(json, 1024)).rejects.toMatchObject({ code: "FI001" });
  });

  it("한도를 넘는 파일은 저장 도중 끊고 임시 파일을 남기지 않는다", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.alloc(5000, 1)], "big.png"));
    const incoming = await readSingleFile(post(form), 1000);
    const root = await mkdtemp(path.join(os.tmpdir(), "bandi-mp-"));
    const storage = new LocalFileStorage(root);
    await expect(saveToTemp(storage, incoming.stream, 1000)).rejects.toMatchObject({ code: "FI002" });
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(storage.tmpDir)).toHaveLength(0);
  });
});
