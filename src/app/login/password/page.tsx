import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/bandi/auth-shell";
import { authService } from "@/features/member/auth-instance";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SETUP_COOKIE } from "../throttle";
import { PasswordForm } from "./password-form";

export const metadata = { title: "비밀번호 설정 - bandi" };

export default async function PasswordPage({ searchParams }: PageProps<"/login/password">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const token = (await cookies()).get(SETUP_COOKIE)?.value;
  // 학교 인증 티켓이 없거나 만료됐으면 인증부터 다시 한다.
  if (!token || !(await authService().isPasswordSetupTicketValid(token))) {
    redirect(`/login/verify?next=${encodeURIComponent(next)}`);
  }
  return (
    <AuthShell title="반디 비밀번호 설정" description="학교 계정 인증이 끝났어요. 앞으로 사용할 반디 비밀번호를 정해 주세요.">
      <PasswordForm next={next} />
      <div className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
        <p className="font-bold text-foreground">이 화면은 인증 후 10분 동안만 유효해요.</p>
        <p className="mt-1">비밀번호를 정하면 바로 로그인되고, 다음부터는 학번과 이 비밀번호로 로그인해요.</p>
      </div>
    </AuthShell>
  );
}
