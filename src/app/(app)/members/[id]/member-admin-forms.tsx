"use client";

import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { changeCohortAction, changeRoleAction, changeStatusAction, changeTeamAction } from "@/features/member/actions";

interface Option {
  id: number;
  name: string;
}

export function MemberAdminForms(props: {
  member: { id: number; teamId: number; cohortId: number; role: string; status: string };
  teams: Option[];
  cohorts: Option[];
  roles: string[];
  statuses: string[];
  roleLabels: Record<string, string>;
  statusLabels: Record<string, string>;
}) {
  const { member } = props;
  const reason = (
    <Field label="변경 사유">
      <input name="reason" required maxLength={500} className={inputClass} />
    </Field>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="팀">
        <ActionForm action={changeTeamAction} submitLabel="팀 변경">
          <input type="hidden" name="memberId" value={member.id} />
          <select name="newTeamId" defaultValue={member.teamId} className={inputClass} aria-label="팀">
            {props.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {reason}
        </ActionForm>
      </Card>
      <Card title="기수">
        <ActionForm action={changeCohortAction} submitLabel="기수 변경">
          <input type="hidden" name="memberId" value={member.id} />
          <select name="newCohortId" defaultValue={member.cohortId} className={inputClass} aria-label="기수">
            {props.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {reason}
        </ActionForm>
      </Card>
      <Card title="권한">
        <ActionForm action={changeRoleAction} submitLabel="권한 변경">
          <input type="hidden" name="memberId" value={member.id} />
          <select name="newRole" defaultValue={member.role} className={inputClass} aria-label="권한">
            {props.roles.map((r) => (
              <option key={r} value={r}>
                {props.roleLabels[r]}
              </option>
            ))}
          </select>
          {reason}
        </ActionForm>
      </Card>
      <Card title="활동 상태">
        <ActionForm action={changeStatusAction} submitLabel="상태 변경">
          <input type="hidden" name="memberId" value={member.id} />
          <select name="newStatus" defaultValue={member.status} className={inputClass} aria-label="상태">
            {props.statuses.map((s) => (
              <option key={s} value={s}>
                {props.statusLabels[s]}
              </option>
            ))}
          </select>
          {reason}
        </ActionForm>
      </Card>
    </div>
  );
}
