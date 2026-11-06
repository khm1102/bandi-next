import Link from "next/link";
import { Card } from "@/components/ui";
import { requirePrincipal } from "@/lib/session";

export const metadata = { title: "처음 시작하기 · 반디" };

const STEPS = [
  { title: "시작", heading: "반디는 동아리 일을 한곳에 남기는 공간이에요.", body: "일정, 공지, 자료, 활동 기록과 소품 정보를 모아 두고 필요한 글은 링크로 공유할 수 있어요. 실제 일정과 팀별 안내는 항상 최신 공지를 기준으로 확인해 주세요.", href: "/dashboard", cta: "홈 보기" },
  { title: "내 정보", heading: "프로필에서 내 소속을 먼저 확인해요.", body: "이름, 학번, 기수, 소속 팀과 역할은 권한과 팀별 안내 범위를 결정하는 정보예요. 학교 SSO에서 확인한 정보는 다음 로그인 때 최신 값으로 갱신됩니다. 정보가 다르게 보이면 운영진에게 변경 사유와 함께 알려 주세요.", href: "/profile", cta: "내 프로필 확인하기" },
  { title: "일정·공지", heading: "이번 주에 해야 할 일은 공지와 캘린더에서 확인해요.", body: "통합 캘린더에는 동아리 전체 일정과 팀 일정이 함께 표시돼요. 공지는 전체 공지와 내 소속 팀 대상 공지가 다를 수 있으니, 새 공지 표시를 함께 확인해 주세요.", href: "/calendar", cta: "캘린더 보기" },
  { title: "기록", heading: "활동은 기록으로 남기고 검수를 받아요.", body: "간단한 활동 기록이나 활동 내역서(HWPX)를 작성해 제출하면 팀장 승인과 운영진 최종 승인을 거쳐 보관함에 모입니다. 자료는 자료실에 함께 공유해요.", href: "/activity", cta: "활동 기록 보기" },
  { title: "소품·장비", heading: "동아리 소품과 장비의 상태를 확인해요.", body: "품목별 수량, 보관 위치, 상태와 변경 이력을 볼 수 있어요. 등록과 수정은 운영진이 관리합니다.", href: "/props", cta: "소품·장비 보기" },
];

export default async function OnboardingPage() {
  await requirePrincipal("/onboarding");
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight">처음 시작하기</h1>
        <p className="text-sm text-muted-foreground">필수 절차를 완료하는 온보딩이 아니라, 동아리 생활과 사이트 사용을 빠르게 익히는 안내예요. (진행 상태는 저장하지 않습니다.)</p>
      </div>
      <ol className="space-y-4" data-testid="onboarding-steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Card title={`${index + 1}단계 · ${step.title}`}>
              <p className="font-bold">{step.heading}</p>
              <p className="text-sm text-foreground">{step.body}</p>
              <Link href={step.href} className="inline-block inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary">
                {step.cta}
              </Link>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
