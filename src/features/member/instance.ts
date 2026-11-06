import "server-only";
import { db } from "@/lib/db";
import { sessionStore } from "@/lib/session";
import { createMemberService } from "./service";

export function memberService() {
  return createMemberService({
    db,
    // 권한·상태가 바뀌면 대상의 세션을 즉시 폐기한다.
    revokeSessions: (memberId) => sessionStore().revokeAll(memberId),
  });
}
