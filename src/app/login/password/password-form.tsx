"use client";

import { useActionState } from "react";
import { setPasswordAction, type PasswordFormState } from "./actions";

const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";
const initial: PasswordFormState = { title: null, message: null, restart: false };

export function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(setPasswordAction, initial);
  return (
    <form action={action} className="mt-5 flex flex-col gap-3" aria-label="반디 비밀번호 설정" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={LABEL} htmlFor="newPassword">새 비밀번호</label>
        <input id="newPassword" name="password" type="password" className={INPUT} autoComplete="new-password" required minLength={10} maxLength={100} placeholder="10자 이상" aria-describedby="passwordHelp authError" />
        <p id="passwordHelp" className="mt-1.5 text-xs text-muted-foreground">10자 이상으로 정해 주세요. 학번과 같은 비밀번호는 사용할 수 없어요.</p>
      </div>
      <div>
        <label className={LABEL} htmlFor="confirmPassword">새 비밀번호 확인</label>
        <input id="confirmPassword" name="confirm" type="password" className={INPUT} autoComplete="new-password" required maxLength={100} placeholder="한 번 더 입력" aria-describedby="authError" />
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
        비밀번호 설정하고 시작하기
      </button>
    </form>
  );
}
