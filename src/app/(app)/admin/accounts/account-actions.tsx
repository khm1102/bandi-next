"use client";

import { ConfirmForm } from "@/components/bandi/confirm-form";
import { ModalFormLauncher } from "@/components/bandi/modal";
import { requirePasswordResetAction, unlockLoginAction } from "@/features/admin/actions";

const COMPACT = "inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-xs font-bold hover:bg-secondary md:min-h-9";

export function UnlockButton({ memberId, name }: { memberId: number; name: string }) {
  return (
    <ConfirmForm action={unlockLoginAction} confirmMessage={`${name}의 로그인 잠금을 해제할까요?`} label="잠금 해제" className={COMPACT}>
      <input type="hidden" name="memberId" value={memberId} />
    </ConfirmForm>
  );
}

/** 비밀번호를 지우고 세션을 끊는다. 멤버는 학교 계정 인증으로 새 비밀번호를 정해야 한다. */
export function ResetPasswordButton({ memberId, name }: { memberId: number; name: string }) {
  return (
    <ModalFormLauncher
      label="비밀번호 재설정 요구"
      variant="outline"
      title="비밀번호 재설정 요구"
      description={`${name}의 반디 비밀번호를 지우고 로그인 중인 기기를 모두 로그아웃시켜요. 다음 로그인 때 학교 계정 인증으로 새 비밀번호를 정해야 해요.`}
      submitLabel="재설정 요구"
      action={requirePasswordResetAction}
    >
      <input type="hidden" name="memberId" value={memberId} />
      <label className="block text-sm font-bold" htmlFor={`reset-reason-${memberId}`}>사유</label>
      <textarea id={`reset-reason-${memberId}`} name="reason" required maxLength={300} placeholder="예) 비밀번호 유출 의심" className="min-h-24 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" />
    </ModalFormLauncher>
  );
}
