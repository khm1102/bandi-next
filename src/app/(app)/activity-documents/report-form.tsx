"use client";

import { useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import { saveReportAction } from "@/features/activity/actions";

interface Participant {
  name: string;
  department: string;
  studentNo: string;
  note: string;
}
interface Candidate {
  name: string;
  department: string | null;
  studentNo: string;
}

export interface ReportFormValues {
  recordId?: number;
  recordTitle: string;
  representative: string;
  location: string;
  activityAt: string;
  content: string;
  participants: Participant[];
  hasPhoto: boolean;
}

const MAX = 14;

export function ReportForm({ values }: { values: ReportFormValues }) {
  const [rows, setRows] = useState<Participant[]>(values.participants.length ? values.participants : [{ name: "", department: "", studentNo: "", note: "" }]);
  const [candidates, setCandidates] = useState<{ index: number; items: Candidate[] } | null>(null);

  const update = (index: number, patch: Partial<Participant>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function search(index: number, query: string) {
    if (query.trim().length < 2) {
      setCandidates(null);
      return;
    }
    const response = await fetch(`/api/activity-documents/participants?q=${encodeURIComponent(query)}`);
    if (response.ok) setCandidates({ index, items: (await response.json()) as Candidate[] });
  }

  return (
    <ActionForm action={saveReportAction} submitLabel="임시 저장">
      {values.recordId ? <input type="hidden" name="recordId" value={values.recordId} /> : null}
      <Field label="활동 기록 제목 (목록 구분용)">
        <input name="recordTitle" required maxLength={150} defaultValue={values.recordTitle} className={inputClass} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="대표자">
          <input name="representative" required maxLength={20} defaultValue={values.representative} className={inputClass} />
        </Field>
        <Field label="활동 장소">
          <input name="location" required maxLength={50} defaultValue={values.location} className={inputClass} />
        </Field>
      </div>
      <Field label="활동 일시">
        <input type="datetime-local" name="activityAt" required defaultValue={values.activityAt} className={inputClass} />
      </Field>
      <Field label="활동 내용">
        <textarea name="content" required rows={6} defaultValue={values.content} className={inputClass} />
      </Field>
      <Field label={values.hasPhoto ? "활동 사진 (바꾸려면 새 파일 선택)" : "활동 사진 (네이비즘 인증 사진)"}>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required={!values.hasPhoto} />
      </Field>
      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">참여자 ({rows.length}/{MAX})</legend>
        {rows.map((row, index) => (
          <div key={index} className="space-y-1">
            <div className="grid gap-2 md:grid-cols-4">
              <input
                name="pName"
                aria-label={`참여자 ${index + 1} 이름`}
                placeholder="이름"
                maxLength={20}
                value={row.name}
                onChange={(e) => {
                  update(index, { name: e.target.value });
                  void search(index, e.target.value);
                }}
                className={inputClass}
              />
              <input name="pDepartment" aria-label={`참여자 ${index + 1} 학과`} placeholder="학과" maxLength={30} value={row.department} onChange={(e) => update(index, { department: e.target.value })} className={inputClass} />
              <input name="pStudentNo" aria-label={`참여자 ${index + 1} 학번`} placeholder="학번" maxLength={20} value={row.studentNo} onChange={(e) => update(index, { studentNo: e.target.value })} className={inputClass} />
              <div className="flex gap-2">
                <input name="pNote" aria-label={`참여자 ${index + 1} 비고`} placeholder="비고" maxLength={40} value={row.note} onChange={(e) => update(index, { note: e.target.value })} className={inputClass} />
                <button type="button" className="text-sm text-destructive underline" onClick={() => setRows((c) => (c.length > 1 ? c.filter((_, i) => i !== index) : c))}>
                  삭제
                </button>
              </div>
            </div>
            {candidates?.index === index && candidates.items.length > 0 ? (
              <ul className="rounded-lg border bg-card text-sm" data-testid="participant-candidates">
                {candidates.items.map((c) => (
                  <li key={c.studentNo}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left hover:bg-secondary"
                      onClick={() => {
                        update(index, { name: c.name, department: c.department ?? "", studentNo: c.studentNo });
                        setCandidates(null);
                      }}
                    >
                      {c.name} · {c.department ?? "-"} · {c.studentNo}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          disabled={rows.length >= MAX}
          className="inline-flex min-h-11 items-center justify-center rounded-md border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
          onClick={() => setRows((c) => [...c, { name: "", department: "", studentNo: "", note: "" }])}
        >
          참여자 추가
        </button>
      </fieldset>
    </ActionForm>
  );
}
