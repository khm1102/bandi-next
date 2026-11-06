import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-black">접근 권한이 없습니다</h1>
      <p className="text-muted-foreground">이 화면을 볼 수 있는 권한이 필요합니다.</p>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
        홈으로
      </Link>
    </main>
  );
}
