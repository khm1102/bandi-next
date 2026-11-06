import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/session";

export default async function Home() {
  if (await getPrincipal()) {
    redirect("/dashboard");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-black tracking-tight">반디</h1>
      <p className="max-w-md text-muted-foreground">
        연극 동아리의 일정, 공지, 자료, 활동 기록, 소품·장비를 한곳에서 운영합니다.
      </p>
      <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
        학교 계정으로 로그인
      </Link>
    </main>
  );
}
