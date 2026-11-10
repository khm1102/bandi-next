"use client";

import Link from "next/link";
import { useActionState } from "react";
import { verifySchoolAction, type VerifyFormState } from "./actions";

const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";
const initial: VerifyFormState = { title: null, message: null, studentNo: "" };

/** 원본 login.jsp의 학교 포털 인증 폼. 인증이 끝나면 학교 비밀번호는 바로 버려진다. */
export function VerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifySchoolAction, initial);
  return (
    <form action={action} className="mt-5 flex flex-col gap-3" aria-label="학교 계정 인증" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={LABEL} htmlFor="studentNo">학교 포털 아이디 (학번)</label>
        <input id="studentNo" name="studentNo" type="text" inputMode="numeric" className={INPUT} autoComplete="username" placeholder="학교 포털 아이디" required maxLength={20} defaultValue={state.studentNo} aria-describedby="authError" />
      </div>
      <div>
        <label className={LABEL} htmlFor="schoolPassword">학교 포털 비밀번호</label>
        <input id="schoolPassword" name="password" type="password" className={INPUT} autoComplete="off" placeholder="학교 포털 비밀번호" required maxLength={100} aria-describedby="authError" />
      </div>
      {state.message ? (
        <div id="authError" className="rounded-md border border-destructive bg-destructive-soft px-3 py-2.5" role="alert" aria-live="polite">
          <b className="block text-sm text-destructive">{state.title}</b>
          <p className="mt-1 text-xs leading-5 text-destructive">{state.message}</p>
        </div>
      ) : (
        <p id="authError" className="hidden" role="alert" aria-live="polite" />
      )}
      <button type="submit" disabled={pending} className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong hover:text-white focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
        학교 계정으로 인증
      </button>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
        로그인으로 돌아가기
      </Link>
    </form>
  );
}
