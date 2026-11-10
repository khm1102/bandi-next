import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** 원본 layoutPublic.tag + header.tag + footer.tag: 비로그인 화면용 셸. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#mainContent" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform focus:translate-y-0">
        본문으로 바로가기
      </a>
      <header className="sticky top-0 z-20 bg-sidebar text-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-3 py-3 md:gap-2.5 md:px-6" aria-label="공개 화면 메뉴">
          <Link href="/login" className="flex min-h-11 shrink-0 items-center gap-2 font-black">
            <Image src="/images/bandi-icon.png" width={32} height={32} className="h-8 w-auto rounded-md object-contain" alt="반디" />
            <span className="hidden md:inline">반디</span>
          </Link>
          <Link href="/login" className="ml-auto inline-flex min-h-11 items-center rounded-md border border-sidebar-border px-2.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white md:px-3">
            멤버 로그인
          </Link>
        </nav>
      </header>
      <main id="mainContent" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6 md:py-7" tabIndex={-1}>
        {children}
      </main>
      <footer className="border-t bg-card px-4 py-7 text-sm text-muted-foreground md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-foreground">한국공학대학교 연극동아리 반디</p>
            <p className="mt-2 text-xs leading-5">멤버 전용 동아리 운영 시스템입니다.</p>
          </div>
          <Link href="/login" className="inline-flex min-h-11 items-center text-xs font-bold text-accent-foreground underline-offset-4 hover:underline">
            멤버 로그인
          </Link>
        </div>
        <div className="mx-auto mt-6 max-w-5xl border-t pt-4 text-xs">&copy; bandi.</div>
      </footer>
    </div>
  );
}

/** 403/404/500 공통 본문 (원본 error/*.jsp). */
export function ErrorPanel({ code, message }: { code: string; message: string }) {
  return (
    <section className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-6xl font-black tracking-tight">{code}</h1>
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      <Link href="/" className="mt-8 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong hover:text-white">
        홈으로
      </Link>
    </section>
  );
}

/** 원본 share/landing.jsp. */
export function ShareLanding({ title, detailPath }: { title: string; detailPath: string }) {
  return (
    <article className="mx-auto max-w-2xl rounded-xl border bg-card p-5 md:p-8">
      <p className="text-sm font-bold text-accent-foreground">반디 내부 게시글</p>
      <h1 className="mt-3 text-2xl font-black tracking-tight">{title}</h1>
      <p className="mt-4 text-sm text-muted-foreground">로그인 후 내용을 확인할 수 있어요.</p>
      <Link href={`/login?next=${encodeURIComponent(detailPath)}`} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-strong hover:text-white">
        로그인하고 글 보기
      </Link>
    </article>
  );
}
