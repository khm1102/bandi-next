"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

const BTN = "inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const SLIDE = "rounded-xl border bg-card p-5 md:p-8";

const STEPS = [
  { short: "시작", aria: "반디 살펴보기", status: "반디를 먼저 살펴봐요" },
  { short: "내 정보", aria: "내 정보 확인", status: "내 정보를 확인해요" },
  { short: "일정·공지", aria: "일정과 공지 확인", status: "일정과 공지를 확인해요" },
  { short: "기록", aria: "자료와 활동 기록", status: "자료와 활동 기록을 알아봐요" },
  { short: "소품·장비", aria: "소품과 장비 확인", status: "소품과 장비를 확인해요" },
];

function Slides(): ReactNode[] {
  return [
    <section key="1" className={SLIDE} aria-labelledby="s1" tabIndex={-1}>
      <p className="text-sm font-extrabold text-accent-foreground">1단계 · 시작</p>
      <h2 id="s1" className="mt-2 text-2xl font-black tracking-tight">반디는 동아리 일을 한곳에 남기는 공간이에요.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">일정, 공지, 자료, 활동 기록과 소품 정보를 모아 두고 필요한 글은 링크로 공유할 수 있어요. 실제 일정과 팀별 안내는 항상 최신 공지를 기준으로 확인해 주세요.</p>
      <dl className="mt-7 grid divide-y border-y text-sm md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="py-4 md:px-5 md:first:pl-0"><dt className="font-extrabold">확인할 정보</dt><dd className="mt-2 leading-6 text-muted-foreground">오늘 일정과 읽지 않은 공지</dd></div>
        <div className="py-4 md:px-5"><dt className="font-extrabold">남길 정보</dt><dd className="mt-2 leading-6 text-muted-foreground">활동 기록과 공용 자료</dd></div>
        <div className="py-4 md:px-5 md:pr-0"><dt className="font-extrabold">찾을 정보</dt><dd className="mt-2 leading-6 text-muted-foreground">동아리 소품과 장비 상태</dd></div>
      </dl>
    </section>,
    <section key="2" className={SLIDE} aria-labelledby="s2" tabIndex={-1}>
      <p className="text-sm font-extrabold text-accent-foreground">2단계 · 내 정보</p>
      <h2 id="s2" className="mt-2 text-2xl font-black tracking-tight">프로필에서 내 소속을 먼저 확인해요.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">이름, 학번, 기수, 소속 팀과 역할은 권한과 팀별 안내 범위를 결정하는 정보예요. 학교 SSO에서 확인한 정보는 다음 로그인 때 최신 값으로 갱신됩니다.</p>
      <div className="mt-7 border-l-2 border-primary pl-4">
        <p className="text-sm font-extrabold">정보가 다르게 보이나요?</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">소속 팀이나 기수 변경이 필요하면 운영진에게 변경 사유와 함께 알려 주세요.</p>
      </div>
      <Link href="/profile" className={`mt-7 ${PRIMARY}`}>내 프로필 확인하기</Link>
    </section>,
    <section key="3" className={SLIDE} aria-labelledby="s3" tabIndex={-1}>
      <p className="text-sm font-extrabold text-accent-foreground">3단계 · 일정과 공지</p>
      <h2 id="s3" className="mt-2 text-2xl font-black tracking-tight">이번 주에 해야 할 일은 공지와 캘린더에서 확인해요.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">통합 캘린더에는 동아리 전체 일정과 팀 일정이 함께 표시돼요. 공지는 전체 공지와 내 소속 팀 대상 공지가 다를 수 있으니, 새 공지 표시를 함께 확인해 주세요.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/calendar" className={BTN}>통합 캘린더 보기</Link>
        <Link href="/notices" className={BTN}>공지 확인하기</Link>
      </div>
    </section>,
    <section key="4" className={SLIDE} aria-labelledby="s4" tabIndex={-1}>
      <p className="text-sm font-extrabold text-accent-foreground">4단계 · 기록</p>
      <h2 id="s4" className="mt-2 text-2xl font-black tracking-tight">필요한 자료를 찾고, 내 활동을 기록으로 남겨요.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">자료실에는 공용 문서, 파일, 링크가 쌓여요. 활동 기록은 내가 작성한 내용을 검수 흐름에 따라 확인하는 공간이에요. 역할에 따라 보이는 메뉴와 가능한 작업은 달라질 수 있어요.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link href="/resources" className="group rounded-lg border p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><b className="block text-sm">자료실</b><span className="mt-1 block text-sm leading-6 text-muted-foreground">파일과 링크로 공유된 자료를 확인해요.</span></Link>
        <Link href="/activity" className="group rounded-lg border p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><b className="block text-sm">내 활동 기록</b><span className="mt-1 block text-sm leading-6 text-muted-foreground">작성한 기록과 현재 검수 단계를 확인해요.</span></Link>
      </div>
    </section>,
    <section key="5" className={SLIDE} aria-labelledby="s5" tabIndex={-1}>
      <p className="text-sm font-extrabold text-accent-foreground">5단계 · 소품과 장비</p>
      <h2 id="s5" className="mt-2 text-2xl font-black tracking-tight">필요한 소품과 장비 상태를 찾아볼 수 있어요.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">소품·장비에서 품목의 사진, 보관 위치와 현재 상태를 확인해요. 운영 관리 기능은 역할에 따라 표시됩니다.</p>
      <div className="mt-7 border-t pt-6">
        <p className="text-sm font-extrabold">준비가 끝났어요.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">이제 홈에서 오늘 일정과 새 공지를 확인하며 시작해 보세요.</p>
        <Link href="/props" className={`mt-5 ${BTN}`}>소품·장비 보기</Link>
      </div>
    </section>,
  ];
}

/** 원본 onboarding/index.js: 5단계 안내를 이전/다음과 단계 버튼으로 넘긴다. 진행 상태는 저장하지 않는다. */
export function OnboardingSlides() {
  const [index, setIndex] = useState(0);
  const slides = Slides();
  const container = useRef<HTMLDivElement>(null);
  const go = (next: number) => {
    setIndex(Math.min(slides.length - 1, Math.max(0, next)));
    requestAnimationFrame(() => container.current?.querySelector<HTMLElement>("section")?.focus({ preventScroll: true }));
  };
  const last = index === slides.length - 1;
  return (
    <>
      <section className="mt-6 rounded-xl border bg-card p-4 md:p-6" aria-label="반디 사용 안내">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold">지금 볼 내용</p>
          <p className="text-sm text-muted-foreground" aria-live="polite">{index + 1} / {slides.length} · {STEPS[index].status}</p>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className="h-full w-full origin-left bg-primary transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${(index + 1) / slides.length})` }} />
        </div>
        <ol className="mt-5 grid grid-cols-5 gap-2" aria-label="안내 단계">
          {STEPS.map((step, i) => (
            <li key={step.short}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                aria-label={`${i + 1}단계, ${step.aria}`}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none md:px-3 ${i === index ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}
              >
                <span>{i + 1}</span>
                <span className="hidden lg:inline">{step.short}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <div className="mt-6" ref={container} data-testid="onboarding-steps">{slides[index]}</div>
      <nav className="mt-6 flex items-center justify-between gap-3 border-t pt-5" aria-label="안내 이동">
        <button type="button" className={`${BTN} disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => go(index - 1)} disabled={index === 0}>이전</button>
        <div className="flex items-center gap-3">
          {last ? <Link href="/dashboard" className={PRIMARY}>홈에서 시작하기</Link> : <button type="button" className={PRIMARY} onClick={() => go(index + 1)}>다음 안내</button>}
        </div>
      </nav>
    </>
  );
}
