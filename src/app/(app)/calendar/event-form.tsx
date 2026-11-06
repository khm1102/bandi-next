"use client";

import { useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";

interface Option {
  id: number;
  name: string;
}

export interface EventFormValues {
  eventId?: number;
  teamId: number | null;
  title: string;
  description: string;
  place: string;
  color: string;
  allDay: boolean;
  start: string;
  end: string;
}

const COLORS: [string, string][] = [
  ["NAVY", "네이비"],
  ["MINT", "민트"],
  ["BLUE", "파랑"],
  ["PLUM", "보라"],
  ["AMBER", "주황"],
  ["ROSE", "장미"],
];

export function EventForm(props: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  teams: Option[];
  /** 선택 가능한 범위: ADMIN은 전체+모든 팀, LEADER는 자기 팀만 */
  allowGlobal: boolean;
  values: EventFormValues;
}) {
  const { values } = props;
  const [allDay, setAllDay] = useState(values.allDay);
  const inputType = allDay ? "date" : "datetime-local";
  return (
    <ActionForm action={props.action} submitLabel={props.submitLabel}>
      {values.eventId ? <input type="hidden" name="eventId" value={values.eventId} /> : null}
      <Field label="일정명">
        <input name="title" required maxLength={150} defaultValue={values.title} className={inputClass} />
      </Field>
      <Field label="일정 범위">
        <select name="teamId" defaultValue={values.teamId ?? "all"} className={inputClass}>
          {props.allowGlobal ? <option value="all">동아리 전체</option> : null}
          {props.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        종일
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={allDay ? "시작일" : "시작"}>
          <input
            key={`start-${inputType}`}
            type={inputType}
            name="start"
            required
            defaultValue={allDay ? values.start.slice(0, 10) : values.start}
            className={inputClass}
          />
        </Field>
        <Field label={allDay ? "마지막 날" : "종료"}>
          <input
            key={`end-${inputType}`}
            type={inputType}
            name="end"
            required
            defaultValue={allDay ? values.end.slice(0, 10) : values.end}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="장소">
        <input name="place" maxLength={200} defaultValue={values.place} className={inputClass} />
      </Field>
      <Field label="표시 색상">
        <select name="color" defaultValue={values.color} className={inputClass}>
          {COLORS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="설명">
        <textarea name="description" rows={4} defaultValue={values.description} className={inputClass} />
      </Field>
    </ActionForm>
  );
}
