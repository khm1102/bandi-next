import { redirect } from "next/navigation";
import { AuthShell } from "@/components/bandi/auth-shell";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getPrincipal } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 - bandi" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getPrincipal()) {
    redirect(next);
  }
  return (
    <AuthShell title="로그인">
      <LoginForm next={next} />
      <div id="loginTrust" className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
        <p className="font-bold text-foreground">학번과 반디 비밀번호로 로그인해요.</p>
        <p className="mt-1">반디 비밀번호는 학교 계정 인증을 한 번 마친 뒤 직접 정해요. 학교 비밀번호는 bandi에 저장하지 않아요.</p>
        <p className="mt-2 rounded-md bg-accent/60 px-3 py-2 text-accent-foreground">운영진이 사전 등록한 재학생 멤버만 이용할 수 있어요.</p>
      </div>
    </AuthShell>
  );
}
