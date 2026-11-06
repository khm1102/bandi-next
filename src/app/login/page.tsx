import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/session";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 · 반디" };

const HIGHLIGHTS = ["일정과 공지를 한곳에서", "활동 기록과 검수", "소품·장비 현황"];

/** 인증 셸: 데스크톱은 와인 소개 패널 + 폼 분할, 모바일은 폼 단일 열 (디자인 가이드 3장). */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getPrincipal()) {
    redirect(next);
  }
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-1/2 max-w-xl flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <p className="text-2xl font-black tracking-tight text-sidebar-accent-foreground">반디</p>
        <div className="space-y-6">
          <h2 className="text-3xl font-black leading-tight tracking-tight text-sidebar-accent-foreground">
            한국공학대학교
            <br />
            연극 동아리 운영 공간
          </h2>
          <ul className="space-y-2 text-sm">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">학교 포털 계정으로만 로그인할 수 있어요.</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 lg:shadow-lg">
          <header className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight">로그인</h1>
            <p className="text-sm text-muted-foreground">한국공학대 학교 포털 계정으로 로그인합니다.</p>
          </header>
          <LoginForm next={next} />
          <p className="text-xs text-muted-foreground">비밀번호는 학교 인증에만 사용되며 서비스에 저장되지 않습니다.</p>
          <nav aria-label="안내" className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="underline">
              개인정보 안내
            </Link>
            <Link href="/support" className="underline">
              운영 문의
            </Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
