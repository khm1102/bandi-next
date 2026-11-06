import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { FileStorageUnavailableError } from "./errors";
import type { StorageScope } from "./codes";

export interface StoredObject {
  stream: ReadStream;
  sizeBytes: number;
}

/** 로컬 영구 볼륨 저장소. 키는 애플리케이션이 만든 상대 경로만 허용한다. */
export class LocalFileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  get tmpDir(): string {
    return path.join(this.root, "tmp");
  }

  /** scope/key를 실제 경로로 바꾼다. 절대경로·`..`·scope 밖 탈출은 거부한다. */
  resolve(scope: StorageScope, storageKey: string): string {
    if (!storageKey || storageKey.includes("\0")) {
      throw new FileStorageUnavailableError();
    }
    const relative = path.posix.normalize(storageKey.replace(/\\/g, "/"));
    if (path.isAbsolute(relative) || relative === "." || relative === ".." || relative.startsWith("../")) {
      throw new FileStorageUnavailableError();
    }
    const scopeRoot = path.join(this.root, scope.toLowerCase());
    const resolved = path.resolve(scopeRoot, relative);
    if (!resolved.startsWith(scopeRoot + path.sep)) {
      throw new FileStorageUnavailableError();
    }
    return resolved;
  }

  async newTempPath(): Promise<string> {
    await mkdir(this.tmpDir, { recursive: true });
    return path.join(this.tmpDir, `${Date.now()}-${crypto.randomUUID()}.part`);
  }

  /** 임시 파일을 대상 위치로 원자적으로 이동한다 (같은 볼륨 rename, 아니면 복사 후 삭제). */
  async commit(tempPath: string, scope: StorageScope, storageKey: string): Promise<void> {
    const target = this.resolve(scope, storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(tempPath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
        throw new FileStorageUnavailableError();
      }
      await copyFile(tempPath, target);
      await rm(tempPath, { force: true });
    }
  }

  async open(scope: StorageScope, storageKey: string): Promise<StoredObject> {
    const target = this.resolve(scope, storageKey);
    try {
      const info = await stat(target);
      return { stream: createReadStream(target), sizeBytes: info.size };
    } catch {
      throw new FileStorageUnavailableError();
    }
  }

  async copy(from: StorageScope, fromKey: string, to: StorageScope, toKey: string): Promise<void> {
    const source = this.resolve(from, fromKey);
    const target = this.resolve(to, toKey);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await copyFile(source, target);
    } catch {
      throw new FileStorageUnavailableError();
    }
  }

  async remove(scope: StorageScope, storageKey: string): Promise<void> {
    await rm(this.resolve(scope, storageKey), { force: true });
  }

  async removeTemp(tempPath: string): Promise<void> {
    await rm(tempPath, { force: true });
  }

  createTempWriter(tempPath: string) {
    return createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
  }
}
