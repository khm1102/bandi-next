"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";

const initial: LoginFormState = { message: null, studentNo: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <label htmlFor="studentNo" className="block text-sm font-semibold">
          학번
        </label>
        <input
          id="studentNo"
          name="studentNo"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          maxLength={20}
          defaultValue={state.studentNo}
          required
          className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-semibold">
          학교 포털 비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          required
          className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </div>
      {state.message ? (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-60"
      >
        {pending ? "확인 중…" : "학교 계정으로 로그인"}
      </button>
    </form>
  );
}
