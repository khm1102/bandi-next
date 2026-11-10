import { ErrorPanel, PublicShell } from "@/components/bandi/public-shell";

export default function NotFound() {
  return (
    <PublicShell>
      <ErrorPanel code="404" message="요청하신 페이지를 찾을 수 없습니다." />
    </PublicShell>
  );
}
