"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/bandi/icons";

const SLIDES = [
  "/images/bandi/586859733_18065598020417765_2136804885828952170_n.jpg",
  "/images/bandi/733606117_18088003127417765_3234727138997425177_n.jpg",
  "/images/bandi/709326027_18084288173417765_3418235853654150586_n.jpg",
  "/images/bandi/582081939_18064841897417765_8418638051277685375_n.jpg",
];
const AUTO_ADVANCE_MS = 7000;

/**
 * 원본 layoutAuth.tag: 데스크톱은 와인 소개 패널(사진 캐러셀) + 폼 분할, 모바일은 폼 단일 열.
 * 캐러셀은 intro-carousel.js와 같이 7초 자동 전환, 수동 조작하면 자동 전환을 멈추고 모션 감소 설정을 존중한다.
 */
export function AuthShell({ title, description = "학번과 비밀번호로 반디 운영 공간에 입장하세요.", children }: { title: string; description?: string; children: ReactNode }) {
  const [active, setActive] = useState(0);
  const manual = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      if (!manual.current) setActive((index) => (index + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, []);

  const go = (index: number) => {
    manual.current = true;
    setActive((index + SLIDES.length) % SLIDES.length);
  };

  return (
    <>
      <a href="#mainContent" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform focus:translate-y-0">
        본문으로 바로가기
      </a>
      <main id="mainContent" className="flex min-h-screen items-stretch bg-secondary lg:items-center lg:p-8" tabIndex={-1}>
        <div className="mx-auto grid w-full max-w-6xl overflow-hidden bg-card lg:grid-cols-[0.92fr_1.08fr] lg:rounded-xl lg:border lg:shadow-xl">
          <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex" aria-label="반디 소개">
            <div className="absolute inset-0" aria-hidden="true">
              {SLIDES.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${index === active ? "opacity-100" : "opacity-0"}`} alt="" />
              ))}
              <div className="absolute inset-0 bg-sidebar/85" />
            </div>
            <div className="relative z-10 flex w-full flex-col p-12">
              <div className="flex items-center gap-3">
                <Image src="/images/bandi-icon.png" width={44} height={44} className="h-11 w-auto rounded-lg object-contain" alt="반디" />
                <span>
                  <b className="block text-lg font-black tracking-tight text-white">반디</b>
                  <span className="block text-xs font-semibold text-sidebar-muted">연극 동아리 통합관리시스템</span>
                </span>
              </div>
              <div className="my-auto max-w-sm py-16">
                <p className="mb-5 text-xs font-black text-primary">반디 운영 포털</p>
                <p className="text-4xl font-black leading-tight tracking-tight text-white">
                  동아리 운영을
                  <br />
                  함께 정리하는 곳.
                </p>
                <p className="mt-7 max-w-xs text-sm font-medium leading-7 text-sidebar-muted">일정, 자료, 활동 기록과 소품 관리를 한곳에서 이어갑니다.</p>
              </div>
              <div className="mt-auto pt-5">
                <div className="flex items-center gap-2" aria-label="소개 사진 선택">
                  <button type="button" className="inline-flex size-11 items-center justify-center rounded-md border border-sidebar-border text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring" aria-label="이전 소개 사진" onClick={() => go(active - 1)}>
                    <Icon name="chevronLeft" />
                  </button>
                  <div className="flex items-center gap-2" role="group" aria-label="소개 사진">
                    {SLIDES.map((src, index) => (
                      <button
                        key={src}
                        type="button"
                        className={`size-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring ${index === active ? "bg-white ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : "bg-white/50 hover:bg-white"}`}
                        aria-label={`${index + 1}번 소개 사진 보기`}
                        aria-pressed={index === active}
                        onClick={() => go(index)}
                      />
                    ))}
                  </div>
                  <button type="button" className="inline-flex size-11 items-center justify-center rounded-md border border-sidebar-border text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring" aria-label="다음 소개 사진" onClick={() => go(active + 1)}>
                    <Icon name="chevronRight" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="flex min-h-screen min-w-0 items-center px-4 py-10 md:px-8 lg:min-h-0 lg:px-16 lg:py-12" aria-label={`${title} 영역`}>
            <div className="mx-auto w-full min-w-0 max-w-md">
              <div className="mb-9 flex items-center gap-3 lg:hidden">
                <Image src="/images/bandi-icon.png" width={44} height={44} className="h-11 w-auto rounded-lg object-contain" alt="반디" />
                <span>
                  <b className="block text-lg font-black tracking-tight">반디</b>
                  <span className="block text-xs font-semibold text-muted-foreground">연극 동아리 통합관리시스템</span>
                </span>
              </div>
              <div className="mb-6">
                <h1 className="text-3xl font-black tracking-tight text-foreground">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              {children}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
