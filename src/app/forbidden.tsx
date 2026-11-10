import { ErrorPanel, PublicShell } from "@/components/bandi/public-shell";

export default function Forbidden() {
  return (
    <PublicShell>
      <ErrorPanel code="403" message="이 페이지에 접근할 권한이 없습니다." />
    </PublicShell>
  );
}
