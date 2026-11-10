"use client";

import { ModalFormLauncher } from "@/components/bandi/modal";
import { changeCohortAction, changeTeamAction } from "@/features/member/actions";

interface Option {
  id: number;
  name: string;
}

const SELECT = "mt-2 min-h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20";
const AREA = "mt-2 min-h-28 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20";

/** 원본 team-members.jsp의 "기수 변경"·"소속 팀 변경" 모달. 서버가 팀장 권한과 대상 팀을 다시 검사한다. */
export function MemberTeamForm(props: { memberId: number; name: string; teams: Option[]; cohorts: Option[]; teamId: number; cohortId: number }) {
  return (
    <>
      <ModalFormLauncher label="기수 변경" variant="outline" title="기수 변경" description={`${props.name} · 새 기수와 변경 사유를 입력해 주세요.`} submitLabel="기수 변경" action={changeCohortAction}>
        <input type="hidden" name="memberId" value={props.memberId} />
        <div>
          <label className="block text-sm font-bold" htmlFor={`cohort-${props.memberId}`}>새 기수</label>
          <select id={`cohort-${props.memberId}`} name="newCohortId" defaultValue={props.cohortId} required className={SELECT}>
            {props.cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold" htmlFor={`cohort-reason-${props.memberId}`}>변경 사유</label>
          <textarea id={`cohort-reason-${props.memberId}`} name="reason" required maxLength={500} placeholder="예) 기수 정보 정정" className={AREA} />
        </div>
      </ModalFormLauncher>
      <ModalFormLauncher label="소속 팀 변경" variant="outline" title="소속 팀 변경" description={`${props.name} · 새 소속 팀과 변경 사유를 입력해 주세요.`} submitLabel="소속 팀 변경" action={changeTeamAction}>
        <input type="hidden" name="memberId" value={props.memberId} />
        <div>
          <label className="block text-sm font-bold" htmlFor={`team-${props.memberId}`}>새 소속 팀</label>
          <select id={`team-${props.memberId}`} name="newTeamId" defaultValue={props.teamId} required className={SELECT}>
            {props.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold" htmlFor={`team-reason-${props.memberId}`}>변경 사유</label>
          <textarea id={`team-reason-${props.memberId}`} name="reason" required maxLength={500} placeholder="예) 팀 운영 조정" className={AREA} />
        </div>
      </ModalFormLauncher>
    </>
  );
}
