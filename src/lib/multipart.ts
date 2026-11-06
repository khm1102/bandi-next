import busboy from "busboy";
import { Readable } from "node:stream";
import { FileTooLargeError, InvalidFileError } from "@/features/file/errors";

export interface IncomingFile {
  name: string;
  /** 본문을 읽어 가야 다음 파트 파싱이 진행된다. */
  stream: ReadableStream<Uint8Array>;
}

/**
 * multipart 요청에서 첫 번째 파일 파트를 스트림으로 꺼낸다 (전체를 메모리에 올리지 않는다).
 * 파일은 정확히 1개만 허용하고, 크기 한도를 넘으면 스트림을 오류로 끊는다.
 */
export function readSingleFile(request: Request, maxBytes: number): Promise<IncomingFile> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data") || !request.body) {
      reject(new InvalidFileError("missing-content"));
      return;
    }
    let found = false;
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: { "content-type": contentType }, defParamCharset: "utf8", limits: { files: 1, fields: 10, fileSize: maxBytes, parts: 12 } });
    } catch {
      reject(new InvalidFileError("missing-content"));
      return;
    }
    parser.on("file", (_field, stream, info) => {
      found = true;
      stream.on("limit", () => stream.destroy(new FileTooLargeError()));
      resolve({ name: info.filename ?? "", stream: Readable.toWeb(stream) as ReadableStream<Uint8Array> });
    });
    parser.on("filesLimit", () => reject(new InvalidFileError("too-many-files")));
    parser.on("error", () => reject(new InvalidFileError("unreadable-content")));
    parser.on("close", () => {
      if (!found) reject(new InvalidFileError("missing-content"));
    });
    Readable.fromWeb(request.body as never).pipe(parser);
  });
}
