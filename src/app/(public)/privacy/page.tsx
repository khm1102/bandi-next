import Link from "next/link";

// 요청마다 CSP nonce가 필요하므로 정적 프리렌더링을 쓰지 않는다.
export const dynamic = "force-dynamic";

export const metadata = { title: "개인정보 안내 · 반디" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-black tracking-tight">개인정보 안내</h1>
      <section className="space-y-2">
        <h2 className="font-extrabold">확인하는 정보</h2>
        <p className="text-sm">
          학교 SSO 로그인 과정에서 학번, 이름, 학과, 학적 상태와 휴대폰 번호를 확인할 수 있어요. 동아리 안에서는 소속 팀, 기수, 역할 같은 운영 정보를 함께 관리합니다.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-extrabold">사용하는 목적</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>학교 계정 인증과 로그인 멤버 확인</li>
          <li>팀·역할에 따른 메뉴와 운영 기능 접근 제어</li>
          <li>공지, 자료, 활동 기록과 소품·장비의 내부 운영</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-extrabold">파일과 게시글</h2>
        <p className="text-sm">
          업로드 파일은 서버의 영구 저장 경로에 보관하고, 데이터베이스에는 파일 이름과 저장 위치 등 관리 정보만 분리해 저장합니다. 학교 계정 비밀번호는 반디에 저장하지 않습니다.
        </p>
        <p className="text-sm">
          공유 링크를 발급한 게시글은 외부 미리보기에 제목만 표시될 수 있으며, 본문과 첨부 파일은 로그인한 멤버만 볼 수 있어요.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-extrabold">정보 확인과 문의</h2>
        <p className="text-sm">
          내 정보가 다르거나 처리 방법이 궁금하면 운영 문의에서 필요한 정보를 확인해 주세요. 소속 팀과 기수 변경처럼 운영 확인이 필요한 항목은 사유와 함께 요청하면 됩니다.
        </p>
        <Link href="/support" className="inline-block inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
          운영 문의 보기
        </Link>
      </section>
    </main>
  );
}
