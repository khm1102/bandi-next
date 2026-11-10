"use client";

import { ErrorPanel, PublicShell } from "@/components/bandi/public-shell";

export default function GlobalError() {
  return (
    <PublicShell>
      <ErrorPanel code="500" message="서버에 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." />
    </PublicShell>
  );
}
