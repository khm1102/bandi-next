import { z } from "zod";
import { fileService } from "@/features/file/instance";
import { InvalidFileError } from "@/features/file/errors";
import { env } from "@/lib/env";
import { readSingleFile } from "@/lib/multipart";
import { apiRoute, jsonError } from "@/lib/http";
import { db } from "@/lib/db";
import { hitShared } from "@/lib/rate-limit-db";

// 업로드 도메인은 코드가 정한 값만 허용한다 (저장 키 접두).
const DOMAIN = z.enum(["resource", "activity", "notice", "asset"]);

export const POST = apiRoute(async (request, principal) => {
  const rate = await hitShared(db, `upload:${principal.memberId}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return jsonError("RATE_LIMITED", "업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  if (!principal.access.active) {
    return Response.json({ code: "FORBIDDEN", message: "권한이 없습니다." }, { status: 403 });
  }
  const url = new URL(request.url);
  const domain = DOMAIN.safeParse(url.searchParams.get("domain"));
  if (!domain.success) {
    throw new InvalidFileError("invalid-domain");
  }
  const file = await readSingleFile(request, env().FILE_STORAGE_MAX_UPLOAD_BYTES);
  const kind = domain.data === "notice" && url.searchParams.get("purpose") === "inline-image" ? "notice-image" : "general";
  const ref = await fileService().upload({
    kind,
    domain: domain.data,
    file: { name: file.name, size: null, stream: file.stream },
    actorId: principal.memberId,
  });
  return Response.json({ id: ref.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
