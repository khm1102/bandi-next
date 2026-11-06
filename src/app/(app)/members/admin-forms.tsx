"use client";

import { ActionForm, Card, Field, inputClass } from "@/components/ui";
import { createCohortAction, preRegisterAction } from "@/features/member/actions";

interface Option {
  id: number;
  name: string;
}

export function AdminForms({ teams, cohorts }: { teams: Option[]; cohorts: Option[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="사전 등록">
        <ActionForm action={preRegisterAction} submitLabel="사전 등록">
          <Field label="학번">
            <input name="studentNo" required inputMode="numeric" maxLength={20} className={inputClass} />
          </Field>
          <Field label="이름">
            <input name="name" required maxLength={50} className={inputClass} />
          </Field>
          <Field label="팀">
            <select name="teamId" className={inputClass}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="기수">
            <select name="cohortId" className={inputClass}>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      </Card>
      <Card title="기수 추가">
        <ActionForm action={createCohortAction} submitLabel="기수 추가">
          <Field label="기수 이름 (예: 1-3)">
            <input name="name" required maxLength={30} className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
