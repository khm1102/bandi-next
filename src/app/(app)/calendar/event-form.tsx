"use client";

import { DateTimeField } from "@/components/bandi/date-time-field";
import { useState } from "react";
import { EditorForm } from "@/components/bandi/editor-form";
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

const COLORS: [string, string, string][] = [
  ["NAVY", "네이비", "#0b1f33"],
  ["MINT", "민트", "#6f0011"],
  ["BLUE", "파랑", "#315f8f"],
  ["PLUM", "보라", "#704983"],
  ["AMBER", "주황", "#80530a"],
  ["ROSE", "장미", "#a63c4d"],
];
const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const LABEL = "mb-1.5 block text-xs font-extrabold text-muted-foreground";

/** 원본 calendar.jsp의 일정 등록 모달 내용(일정명·범위·색상·종일·시간·장소·설명). 서버가 권한과 범위를 다시 검사한다. */
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
  const [color, setColor] = useState(values.color);
  return (
    <EditorForm action={props.action} cancelHref="/calendar" submitLabel={props.submitLabel === "등록" ? "일정 저장" : props.submitLabel}>
      {values.eventId ? <input type="hidden" name="eventId" value={values.eventId} /> : null}
      <div className="space-y-5">
        <div>
          <label className={LABEL} htmlFor="ceTitle">일정명 <span className="text-accent-foreground">*</span></label>
          <input className={INPUT} id="ceTitle" name="title" type="text" maxLength={150} required placeholder="예) 전체 연습" defaultValue={values.title} />
        </div>
        <fieldset className="border-y py-4">
          <legend className="sr-only">일정 기본 설정</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <label className={LABEL} htmlFor="ceTeam">일정 범위</label>
              <select className={INPUT} id="ceTeam" name="teamId" defaultValue={values.teamId ?? "all"}>
                {props.allowGlobal ? <option value="all">동아리 전체</option> : null}
                {props.teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <fieldset>
                <legend className={LABEL}>표시 색상</legend>
                <div className="flex flex-wrap gap-1">
                  {COLORS.map(([code, label, hex]) => (
                    <label key={code} className="inline-grid min-h-11 min-w-11 cursor-pointer place-items-center">
                      <input className="peer sr-only" type="radio" name="color" value={code} checked={color === code} onChange={() => setColor(code)} />
                      <span className="grid size-6 place-items-center rounded-full border-2 border-transparent transition peer-checked:ring-2 peer-checked:ring-ring peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" style={{ backgroundColor: hex }} aria-hidden="true" />
                      <span className="sr-only">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-md border bg-card px-3 text-sm font-bold">
                <input type="checkbox" name="allDay" className="size-4 rounded border-input" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                종일 일정
              </label>
            </div>
          </div>
        </fieldset>
        <section aria-labelledby="calendarTimeHeading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id="calendarTimeHeading" className="text-sm font-extrabold">일정 시간</h3>
            <p className="text-xs text-muted-foreground">{allDay ? "시작일과 마지막 날" : "30분 단위"}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateTimeField id="ceStart" name="start" label={allDay ? "시작일" : "시작"} required minuteStep={30} dateOnly={allDay} defaultValue={values.start} />
            <DateTimeField id="ceEnd" name="end" label={allDay ? "마지막 날" : "종료"} required minuteStep={30} dateOnly={allDay} defaultValue={values.end} />
          </div>
        </section>
        <details className="rounded-md border bg-secondary/40" open={Boolean(values.place || values.description)}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-bold">
            장소와 설명 추가
            <span className="text-xs font-medium text-muted-foreground">선택</span>
          </summary>
          <div className="space-y-4 border-t px-3 py-4">
            <div>
              <label className={LABEL} htmlFor="ceLoc">장소</label>
              <input className={INPUT} id="ceLoc" name="place" type="text" maxLength={200} placeholder="정해지지 않았다면 비워 두세요" defaultValue={values.place} />
            </div>
            <div>
              <label className={LABEL} htmlFor="ceDescription">설명</label>
              <textarea className="min-h-28 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm" id="ceDescription" name="description" placeholder="준비물이나 진행 내용을 입력하세요" defaultValue={values.description} />
            </div>
          </div>
        </details>
      </div>
    </EditorForm>
  );
}
