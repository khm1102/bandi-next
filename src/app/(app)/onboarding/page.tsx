import Link from "next/link";
import { requirePrincipal } from "@/lib/session";
import { OnboardingSlides } from "./onboarding-slides";

export const metadata = { title: "처음 시작하기 · 반디" };

export default async function OnboardingPage() {
  await requirePrincipal("/onboarding");
  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="flex flex-wrap items-start justify-between gap-4" aria-labelledby="onboardingPageTitle">
        <div>
          <p className="text-sm font-extrabold text-accent-foreground">처음 시작하기</p>
          <h1 id="onboardingPageTitle" className="mt-1 text-2xl font-black tracking-tight">반디를 5단계로 둘러봐요.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">필수 절차를 완료하는 온보딩이 아니라, 동아리 생활과 사이트 사용을 빠르게 익히는 안내예요.</p>
        </div>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">바로 홈으로</Link>
      </header>
      <OnboardingSlides />
    </div>
  );
}
