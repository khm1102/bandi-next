import { redirect } from "next/navigation";
import { AuthShell } from "@/components/bandi/auth-shell";
import { LOGIN_ERROR_TEXT } from "@/features/member/messages";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getPrincipal } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "학교 계정 인증 - bandi" };

export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getPrincipal()) {
    redirect(next);
  }
  return (
    <AuthShell title="학교 계정 인증" description="학교 포털로 본인과 재학 여부를 확인한 뒤, 반디 비밀번호를 정해요.">
      {params.expired ? (
        <div className="mb-4 rounded-md border border-destructive bg-destructive-soft px-3 py-2.5" role="alert" data-testid="setup-expired">
          <b className="block text-sm text-destructive">{LOGIN_ERROR_TEXT["password-setup-expired"].title}</b>
          <p className="mt-1 text-xs leading-5 text-destructive">{LOGIN_ERROR_TEXT["password-setup-expired"].message}</p>
        </div>
      ) : null}
      <div className="rounded-lg border bg-secondary/60 p-4">
        <p className="text-sm font-extrabold">한국공학대학교 포털 계정으로 인증합니다</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">현재 학교 시스템에서 재학생으로 확인되고, 운영진이 사전 등록한 멤버만 이용할 수 있습니다.</p>
      </div>
      <VerifyForm next={next} />
      <div className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
        <p className="font-bold text-foreground">학교 비밀번호는 bandi에 저장하지 않습니다.</p>
        <p className="mt-1">인증이 끝나면 학교 비밀번호는 즉시 폐기하고, 학번·이름·학적 상태만 확인해요. 인증 후 10분 안에 반디 비밀번호를 정하면 다음부터는 학번과 그 비밀번호로 로그인해요.</p>
      </div>
    </AuthShell>
  );
}
