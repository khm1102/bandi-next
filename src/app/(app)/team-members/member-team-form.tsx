"use client";

import { ActionForm, Field, inputClass } from "@/components/ui";
import { changeCohortAction, changeTeamAction } from "@/features/member/actions";

interface Option {
  id: number;
  name: string;
}

export function MemberTeamForm(props: {
  memberId: number;
  teams: Option[];
  cohorts: Option[];
  teamId: number;
  cohortId: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ActionForm action={changeTeamAction} submitLabel="팀 변경">
        <input type="hidden" name="memberId" value={props.memberId} />
        <Field label="팀">
          <select name="newTeamId" defaultValue={props.teamId} className={inputClass}>
            {props.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="사유">
          <input name="reason" required maxLength={500} className={inputClass} />
        </Field>
      </ActionForm>
      <ActionForm action={changeCohortAction} submitLabel="기수 변경">
        <input type="hidden" name="memberId" value={props.memberId} />
        <Field label="기수">
          <select name="newCohortId" defaultValue={props.cohortId} className={inputClass}>
            {props.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="사유">
          <input name="reason" required maxLength={500} className={inputClass} />
        </Field>
      </ActionForm>
    </div>
  );
}
