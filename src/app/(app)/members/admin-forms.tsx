"use client";

import { ModalFormLauncher } from "@/components/bandi/modal";
import { createCohortAction, preRegisterAction } from "@/features/member/actions";

interface Option {
  id: number;
  name: string;
}

const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";
const Req = () => <span className="text-accent-foreground">*</span>;

/** 원본 members/list.jsp의 "기수 관리"·"+ 멤버 사전 등록" 모달. */
export function AdminForms({ teams, cohorts }: { teams: Option[]; cohorts: Option[] }) {
  return (
    <>
      <ModalFormLauncher label="기수 관리" variant="outline" title="기수 관리" description="기수 이름을 추가하면 멤버 등록과 기수 변경에서 바로 선택할 수 있어요." submitLabel="기수 추가" action={createCohortAction}>
        <div>
          <label className={LABEL} htmlFor="cohortName">새 기수 이름 <Req /></label>
          <input className={INPUT} id="cohortName" name="name" type="text" required maxLength={30} placeholder="예) 1-2" />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">기수는 삭제하지 않고 추가만 할 수 있어요. 등록된 멤버와 변경 이력은 그대로 유지됩니다.</p>
        </div>
      </ModalFormLauncher>
      <ModalFormLauncher label="+ 멤버 사전 등록" title="멤버 사전 등록" description="학교 SSO 첫 로그인 전에 학번과 이름, 단일 소속 팀을 등록합니다." submitLabel="등록" action={preRegisterAction}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="mbStudentNo">학번 <Req /></label>
            <input className={INPUT} id="mbStudentNo" name="studentNo" type="text" inputMode="numeric" required maxLength={20} placeholder="학교 학번" />
          </div>
          <div>
            <label className={LABEL} htmlFor="mbName">이름 <Req /></label>
            <input className={INPUT} id="mbName" name="name" type="text" required maxLength={50} placeholder="학교 등록 이름" />
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="mbTeam">소속 팀 <Req /></label>
          <select className={INPUT} id="mbTeam" name="teamId" required defaultValue="">
            <option value="" disabled>팀을 선택해 주세요</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">한 멤버는 동시에 하나의 활성 팀에만 소속됩니다.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="mbCohort">기수 <Req /></label>
          <select className={INPUT} id="mbCohort" name="cohortId" required defaultValue="">
            <option value="" disabled>기수를 선택해 주세요</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </ModalFormLauncher>
    </>
  );
}
