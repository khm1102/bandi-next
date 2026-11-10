"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";

const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";
const initial: LoginFormState = { title: null, message: null, studentNo: "" };

/** 반디 계정 로그인: 학번 + 반디 비밀번호. 처음이거나 비밀번호를 잊었다면 학교 계정 인증으로 설정한다. */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <>
      <form action={action} className="mt-5 flex flex-col gap-3" aria-label="반디 계정 로그인" noValidate>
        <input type="hidden" name="next" value={next} />
        <div>
          <label className={LABEL} htmlFor="studentNo">학번</label>
          <input id="studentNo" name="studentNo" type="text" inputMode="numeric" className={INPUT} autoComplete="username" placeholder="학번" required maxLength={20} defaultValue={state.studentNo} aria-describedby="loginTrust authError" />
        </div>
        <div>
          <label className={LABEL} htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" className={INPUT} autoComplete="current-password" placeholder="반디 비밀번호" required maxLength={200} aria-describedby="loginTrust authError" />
        </div>
        {state.message ? (
          <div id="authError" className="rounded-md border border-destructive bg-destructive-soft px-3 py-2.5" role="alert" aria-live="polite">
            <b className="block text-sm text-destructive">{state.title}</b>
            <p className="mt-1 text-xs leading-5 text-destructive">{state.message}</p>
          </div>
        ) : (
          <p id="authError" className="hidden" role="alert" aria-live="polite" />
        )}
        <button type="submit" disabled={pending} className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong hover:text-white focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
          로그인
        </button>
      </form>
      <div className="mt-4 rounded-lg border bg-secondary/60 p-4">
        <p className="text-sm font-extrabold">처음이거나 비밀번호를 잊으셨나요?</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">학교 계정으로 본인과 재학 여부를 한 번 확인한 뒤, 반디 비밀번호를 새로 정할 수 있어요.</p>
        <Link href={`/login/verify?next=${encodeURIComponent(next)}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
          학교 계정으로 인증하고 비밀번호 설정
        </Link>
      </div>
    </>
  );
}
