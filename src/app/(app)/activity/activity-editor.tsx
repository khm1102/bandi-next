"use client";

import { useState } from "react";
import { ActionForm, Field, inputClass } from "@/components/ui";
import { saveActivityAction } from "@/features/activity/actions";

interface Option {
  id: number;
  name: string;
}
interface Photo {
  id: number;
  name: string;
}

export function ActivityEditor(props: {
  recordId?: number;
  teams: Option[];
  canChooseTeam: boolean;
  values: { teamId: number; activityAt: string; title: string; body: string; participantCount: number; photos: Photo[] };
}) {
  const [photos, setPhotos] = useState<Photo[]>(props.values.photos);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files/private?domain=activity", { method: "POST", body: form });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      setUploadError(error?.message ?? "업로드하지 못했습니다.");
      return;
    }
    const { id } = (await response.json()) as { id: number };
    setPhotos((current) => [...current, { id, name: file.name }]);
  }

  return (
    <ActionForm action={saveActivityAction} submitLabel="저장">
      {props.recordId ? <input type="hidden" name="recordId" value={props.recordId} /> : null}
      {props.canChooseTeam && !props.recordId ? (
        <Field label="팀">
          <select name="teamId" defaultValue={props.values.teamId} className={inputClass}>
            {props.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="제목">
        <input name="title" required maxLength={150} defaultValue={props.values.title} className={inputClass} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="활동 일시">
          <input type="datetime-local" name="activityAt" required defaultValue={props.values.activityAt} className={inputClass} />
        </Field>
        <Field label="참여 인원">
          <input type="number" name="participantCount" required min={1} defaultValue={props.values.participantCount} className={inputClass} />
        </Field>
      </div>
      <Field label="내용">
        <textarea name="body" required rows={8} defaultValue={props.values.body} className={inputClass} />
      </Field>
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p className="font-semibold">사진 (선택)</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="사진 첨부"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await upload(file);
            e.target.value = "";
          }}
        />
        {uploadError ? <p className="text-destructive">{uploadError}</p> : null}
        <ul className="space-y-1">
          {photos.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <input type="hidden" name="photoFileId" value={p.id} />
              <span>{p.name}</span>
              <button type="button" className="text-destructive underline" onClick={() => setPhotos((c) => c.filter((x) => x.id !== p.id))}>
                제거
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ActionForm>
  );
}
