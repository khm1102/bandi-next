"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/bandi/button";
import { DateTimeField } from "@/components/bandi/date-time-field";
import { saveReportInlineAction, submitReportInlineAction } from "@/features/activity/actions";

interface Participant {
  key: number;
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
  participants: { name: string; department: string; studentNo: string; note: string }[];
  /** 저장된 사진이 있으면 그 사진의 다운로드 주소 */
  storedPhotoUrl: string | null;
  storedPhotoName: string | null;
  storedDocument: { url: string; name: string } | null;
  /** DRAFT/REVISION_REQUESTED 외의 상태면 수정할 수 없다 */
  status: string | null;
}

const MAX = 14;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const INPUT = "min-h-11 w-full rounded-md border border-input bg-card px-3 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm aria-[invalid=true]:border-destructive";
const LABEL = "mb-1.5 block text-sm font-bold text-foreground";
const Req = () => <span className="text-destructive">*</span>;
const FieldError = ({ message }: { message?: string }) => (message ? <p className="mt-1 text-xs text-destructive" role="alert">{message}</p> : null);

type Errors = Record<string, string>;

// 참여자 행의 React key용 일련번호 (DOM 값이 아니라 렌더링 식별자일 뿐이다).
let keySeed = 0;
const nextKey = () => ++keySeed;

function emptyRow(key: number): Participant {
  return { key, name: "", department: "", studentNo: "", note: "" };
}

/**
 * 원본 activity/document.js 흐름: 클라이언트 검증(필드별 오류) → 저장(HWPX 생성) → 성공 카드(다운로드·검수 요청·새로 작성).
 * 서버가 모든 입력을 다시 검증하며, 제출 후에는 수정할 수 없다.
 */
export function ReportForm({ values, presidentName }: { values: ReportFormValues; presidentName: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  const searchId = useId();

  const lockedByStatus = values.status !== null && values.status !== "DRAFT" && values.status !== "REVISION_REQUESTED";
  const [recordId, setRecordId] = useState<number | null>(values.recordId ?? null);
  const [document, setDocument] = useState(values.storedDocument);
  const [title, setTitle] = useState(values.recordTitle);
  const [representative, setRepresentative] = useState(values.representative);
  const [location, setLocation] = useState(values.location);
  const [content, setContent] = useState(values.content);
  const [rows, setRows] = useState<Participant[]>(() => values.participants.map((p) => ({ ...p, key: nextKey() })));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [storedPhoto, setStoredPhoto] = useState({ url: values.storedPhotoUrl, name: values.storedPhotoName });
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ title: string; message: string; canSubmit: boolean } | null>(() =>
    values.recordId
      ? lockedByStatus
        ? {
            title: values.status === "SUBMITTED" ? "운영진에게 검수를 요청했어요." : "현재 상태에서는 문서를 수정할 수 없습니다.",
            message: values.status === "SUBMITTED" ? "활동 기록에서 처리 상태를 확인할 수 있습니다." : "활동 기록에서 검수 상태와 운영진 의견을 확인해 주세요.",
            canSubmit: false,
          }
        : {
            title: values.status === "REVISION_REQUESTED" ? "수정 요청된 활동 내역서를 불러왔어요." : "임시 저장된 활동 내역서를 불러왔어요.",
            message: "내용을 수정해 다시 저장하거나 현재 문서를 검수 요청할 수 있습니다.",
            canSubmit: true,
          }
      : null,
  );
  const [submitted, setSubmitted] = useState(lockedByStatus);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"draft" | "submit" | "request" | null>(null);

  // 검색
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Candidate[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const generation = useRef(0);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const searchTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  /** 입력할 때마다 호출한다: 2자 미만이면 목록을 비우고, 아니면 300ms 뒤 검색한다 (이전 응답은 버린다). */
  function onSearchInput(value: string) {
    setQuery(value);
    window.clearTimeout(searchTimer.current);
    const text = value.trim();
    const current = ++generation.current;
    if (text.length < 2) {
      setSuggestions([]);
      setSearchNote(null);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/activity-documents/participants?q=${encodeURIComponent(text)}`);
        if (current !== generation.current) return;
        if (!response.ok) throw new Error("search");
        const items = (await response.json()) as Candidate[];
        setSuggestions(items);
        setActive(-1);
        setSearchNote(items.length === 0 ? "일치하는 활성 멤버가 없습니다. 직접 입력으로 추가할 수 있습니다." : null);
      } catch {
        if (current !== generation.current) return;
        setSuggestions([]);
        setSearchNote("멤버를 검색하지 못했습니다. 직접 입력은 계속 사용할 수 있습니다.");
      }
    }, 300);
  }

  const touch = () => setDirty(true);
  const clearError = (field: string) => setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));

  function addParticipant(initial: Partial<Participant> = {}) {
    if (rows.length >= MAX) {
      setErrors((current) => ({ ...current, participants: "참여 인원은 최대 14명까지 입력할 수 있습니다." }));
      return;
    }
    setRows((current) => [...current, { ...emptyRow(nextKey()), ...initial }]);
    clearError("participants");
    touch();
  }
  const updateRow = (key: number, patch: Partial<Participant>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    touch();
  };
  function pick(candidate: Candidate) {
    addParticipant({ name: candidate.name, department: candidate.department ?? "", studentNo: candidate.studentNo });
    setQuery("");
    setSuggestions([]);
  }

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErrors((current) => ({ ...current, photo: "JPG 또는 PNG 사진만 사용할 수 있습니다." }));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErrors((current) => ({ ...current, photo: "사진은 10MiB 이하만 사용할 수 있습니다." }));
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setStoredPhoto({ url: null, name: null });
    clearError("photo");
    touch();
  }
  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    touch();
  }

  function validate(activityAt: string): Errors {
    const found: Errors = {};
    if (!title.trim()) found.recordTitle = "활동 기록 제목을 입력해 주세요.";
    if (!representative.trim()) found.representative = "대표자를 입력해 주세요.";
    if (!location.trim()) found.location = "활동 장소를 입력해 주세요.";
    if (!activityAt) found.activityAt = "활동 일시를 선택해 주세요.";
    if (!content.trim()) found.content = "활동 내용을 입력해 주세요.";
    if (rows.length === 0) found.participants = "참여 인원을 한 명 이상 추가해 주세요.";
    else if (rows.some((row) => !row.name.trim())) found.participants = "모든 참여자의 이름을 입력해 주세요.";
    if (!photo && !storedPhoto.url) found.photo = "활동 사진을 선택해 주세요.";
    return found;
  }

  function save(submitAfter: boolean) {
    if (!presidentName) {
      setFormError("현재 회장이 등록되지 않아 문서를 만들 수 없습니다.");
      return;
    }
    const body = new FormData(form.current ?? undefined);
    const found = validate(String(body.get("activityAt") ?? ""));
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      form.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"]`)?.focus();
      return;
    }
    if (photo) body.set("photo", photo);
    else body.delete("photo");
    if (recordId) body.set("recordId", String(recordId));
    setBusy(submitAfter ? "submit" : "draft");
    start(async () => {
      const result = await saveReportInlineAction(body);
      if (!result.ok || !result.recordId) {
        setErrors((current) => ({ ...current, ...result.fieldErrors }));
        setFormError(result.message ?? "활동 내역서를 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.");
        setBusy(null);
        return;
      }
      setRecordId(result.recordId);
      setDocument(result.documentFileId ? { url: `/api/activity-management/${result.recordId}/files/${result.documentFileId}/download`, name: result.filename ?? "활동_내역서.hwpx" } : null);
      setStoredPhoto({ url: result.photoFileId ? `/api/activity-management/${result.recordId}/files/${result.photoFileId}/download` : storedPhoto.url, name: photo?.name ?? storedPhoto.name });
      setPhoto(null);
      setDirty(false);
      window.history.replaceState({}, "", `/activity-documents?draft=${result.recordId}`);
      if (submitAfter) {
        const requested = await submitReportInlineAction(result.recordId);
        if (requested.ok) {
          setSuccess({ title: "운영진에게 검수를 요청했어요.", message: "활동 기록에서 처리 상태를 확인할 수 있습니다.", canSubmit: false });
          setSubmitted(true);
        } else {
          setSuccess({ title: "임시 저장은 완료했지만 검수를 요청하지 못했어요.", message: "입력값과 파일은 보존되어 있습니다. 잠시 후 검수 요청을 다시 눌러 주세요.", canSubmit: true });
          setFormError(requested.message ?? "검수를 요청하지 못했습니다.");
        }
      } else {
        setSuccess({ title: "활동 내역서를 임시 저장했어요.", message: "입력값·사진·HWPX가 활동 기록에 저장됐습니다.", canSubmit: true });
      }
      setBusy(null);
    });
  }

  function requestReview() {
    if (!recordId) return;
    setBusy("request");
    setFormError(null);
    start(async () => {
      const result = await submitReportInlineAction(recordId);
      if (result.ok) {
        setSuccess({ title: "운영진에게 검수를 요청했어요.", message: "활동 기록에서 처리 상태를 확인할 수 있습니다.", canSubmit: false });
        setSubmitted(true);
      } else {
        setFormError(result.message ?? "검수를 요청하지 못했습니다.");
      }
      setBusy(null);
    });
  }

  function reset() {
    form.current?.reset();
    setRecordId(null);
    setDocument(null);
    setTitle("");
    setRepresentative("");
    setLocation("");
    setContent("");
    setRows([]);
    setPhoto(null);
    setPhotoPreview(null);
    setStoredPhoto({ url: null, name: null });
    setErrors({});
    setFormError(null);
    setSuccess(null);
    setSubmitted(false);
    setDirty(false);
    window.history.replaceState({}, "", "/activity-documents");
  }

  const disabled = pending || submitted;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return setSuggestions([]);
    if (suggestions.length === 0 || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowDown") setActive((i) => (i + 1) % suggestions.length);
    else if (event.key === "ArrowUp") setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    else if (active >= 0) pick(suggestions[active]);
  };

  return (
    <>
      <section className="mb-5 rounded-lg border bg-card px-4 py-4 md:px-5" aria-label="문서 생성 안내">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm" aria-hidden="true">i</span>
          <div>
            <p className="text-sm font-extrabold">입력 내용과 문서는 안전하게 저장됩니다.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">임시 저장하면 입력값·사진·HWPX가 활동 기록에 보관되고, 검수 요청 후 운영진이 확인할 수 있습니다.</p>
            {presidentName ? (
              <p className="mt-2 text-xs font-bold">문서 확인: 반디 회장 {presidentName}</p>
            ) : (
              <p className="mt-2 text-xs font-bold text-destructive" role="alert">현재 회장이 등록되지 않아 문서를 만들 수 없습니다. 운영 DB에 실제 회장을 배정해 주세요.</p>
            )}
          </div>
        </div>
      </section>

      <form ref={form} onSubmit={(e) => e.preventDefault()} onChange={touch} noValidate>
        <fieldset disabled={disabled} className="min-w-0">
          <section className="border-t py-6" aria-labelledby="activityReportBasicTitle">
            <h2 id="activityReportBasicTitle" className="text-lg font-black">기본 정보</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2" data-field="recordTitle">
                <label className={LABEL} htmlFor="recordTitle">활동 기록 제목 <Req /></label>
                <input id="recordTitle" name="recordTitle" maxLength={150} value={title} onChange={(e) => { setTitle(e.target.value); clearError("recordTitle"); }} className={INPUT} aria-invalid={Boolean(errors.recordTitle)} />
                <p className="mt-1.5 text-xs text-muted-foreground">목록에서 활동을 구분하는 제목입니다. HWPX 양식의 제목 형식은 바뀌지 않습니다.</p>
                <FieldError message={errors.recordTitle} />
              </div>
              <div data-field="representative">
                <label className={LABEL} htmlFor="representative">대표자 <Req /></label>
                <input id="representative" name="representative" maxLength={20} autoComplete="name" value={representative} onChange={(e) => { setRepresentative(e.target.value); clearError("representative"); }} className={INPUT} aria-invalid={Boolean(errors.representative)} />
                <p className="mt-1.5 text-xs text-muted-foreground">활동을 대표해 내역서를 작성하는 사람을 입력해 주세요.</p>
                <FieldError message={errors.representative} />
              </div>
              <div data-field="location">
                <label className={LABEL} htmlFor="location">활동 장소 <Req /></label>
                <input id="location" name="location" maxLength={50} value={location} onChange={(e) => { setLocation(e.target.value); clearError("location"); }} className={INPUT} aria-invalid={Boolean(errors.location)} />
                <FieldError message={errors.location} />
              </div>
              <div className="md:col-span-2" data-field="activityAt">
                <DateTimeField id="activityAt" name="activityAt" label="활동 일시" required defaultValue={values.activityAt} />
                <FieldError message={errors.activityAt} />
              </div>
            </div>
          </section>

          <section className="border-t py-6" aria-labelledby="activityReportPhotoTitle" data-field="photo">
            <h2 id="activityReportPhotoTitle" className="text-lg font-black">활동 사진</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">JPG 또는 PNG 한 장, 최대 10MiB까지 올릴 수 있습니다. 사진은 자르지 않고 양식 안에 맞춰 넣습니다.</p>
            <label
              className={`mt-4 flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary ${dragging ? "border-ring bg-secondary" : "border-input bg-card"}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); choosePhoto(e.dataTransfer.files[0]); }}
            >
              <span className="text-sm font-extrabold">{photo ? "다른 사진으로 바꾸려면 선택하거나 여기에 놓아 주세요" : "사진을 선택하거나 여기에 놓아 주세요"}</span>
              <span className="mt-1 text-xs text-muted-foreground">JPG·PNG · 최대 10MiB</span>
              {photoPreview || storedPhoto.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mt-4 max-h-64 max-w-full rounded-md object-contain" src={photoPreview ?? storedPhoto.url ?? undefined} alt="선택한 활동 사진 미리보기" />
              ) : null}
              <input className="sr-only" type="file" aria-label="활동 사진" accept="image/jpeg,image/png" onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {photo || storedPhoto.name ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{photo?.name ?? storedPhoto.name ?? "저장된 활동 사진"}</span>
                {photo ? <button type="button" className={buttonClass("outline", "compact")} onClick={removePhoto}>사진 제거</button> : null}
              </div>
            ) : null}
            <FieldError message={errors.photo} />
          </section>

          <section className="border-t py-6" aria-labelledby="activityReportContentTitle" data-field="content">
            <div className="flex items-end justify-between gap-3">
              <h2 id="activityReportContentTitle" className="text-lg font-black">활동 내용</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{content.length} / 300자</span>
            </div>
            <textarea id="content" name="content" maxLength={300} value={content} onChange={(e) => { setContent(e.target.value); clearError("content"); }} aria-label="활동 내용" aria-invalid={Boolean(errors.content)} className="mt-4 min-h-44 w-full resize-y rounded-md border border-input bg-card px-3 py-3 text-base leading-6 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 aria-[invalid=true]:border-destructive md:text-sm" />
            <FieldError message={errors.content} />
          </section>

          <section className="border-t py-6" aria-labelledby="activityReportParticipantsTitle" data-field="participants">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="activityReportParticipantsTitle" className="text-lg font-black">참여 인원</h2>
                <p className="mt-1 text-xs text-muted-foreground">최대 14명까지 입력할 수 있으며 서명 칸은 문서에서 비워 둡니다.</p>
              </div>
              <span className="text-xs font-bold tabular-nums">{rows.length} / {MAX}명</span>
            </div>
            <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-start">
              <div className="relative min-w-0 flex-1">
                <label className="sr-only" htmlFor={searchId}>등록 멤버 검색</label>
                <input
                  id={searchId}
                  type="search"
                  autoComplete="off"
                  maxLength={50}
                  placeholder="이름 또는 학번 2자 이상 검색"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestions.length > 0}
                  aria-controls={`${searchId}-list`}
                  aria-activedescendant={active >= 0 ? `${searchId}-opt-${active}` : undefined}
                  className={INPUT}
                  value={query}
                  onChange={(e) => onSearchInput(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                {suggestions.length > 0 ? (
                  <div id={`${searchId}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-card p-1 shadow-lg" data-testid="participant-candidates">
                    {suggestions.map((c, index) => (
                      <button key={c.studentNo} id={`${searchId}-opt-${index}`} type="button" role="option" aria-selected={index === active} onClick={() => pick(c)} className={`flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring ${index === active ? "bg-secondary" : ""}`}>
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm">{c.name}</b>
                          <span className="block truncate text-xs text-muted-foreground">{[c.department, c.studentNo].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {searchNote ? <p className="mt-1 text-xs text-destructive">{searchNote}</p> : null}
              </div>
              <button type="button" className={`w-full md:w-auto ${buttonClass("outline")}`} onClick={() => addParticipant()}>직접 입력 추가</button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {rows.map((row, index) => (
                <article key={row.key} className="rounded-lg border bg-card p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_1fr_1.4fr_auto] md:items-end">
                    <label className="text-xs font-bold">이름
                      <input name="pName" aria-label={`참여자 ${index + 1} 이름`} maxLength={20} value={row.name} onChange={(e) => { updateRow(row.key, { name: e.target.value }); clearError("participants"); }} className={`mt-1 ${INPUT}`} />
                    </label>
                    <label className="text-xs font-bold">학과
                      <input name="pDepartment" aria-label={`참여자 ${index + 1} 학과`} maxLength={30} value={row.department} onChange={(e) => updateRow(row.key, { department: e.target.value })} className={`mt-1 ${INPUT}`} />
                    </label>
                    <label className="text-xs font-bold">학번
                      <input name="pStudentNo" aria-label={`참여자 ${index + 1} 학번`} inputMode="numeric" maxLength={20} value={row.studentNo} onChange={(e) => updateRow(row.key, { studentNo: e.target.value })} className={`mt-1 ${INPUT}`} />
                    </label>
                    <label className="text-xs font-bold">비고
                      <input name="pNote" aria-label={`참여자 ${index + 1} 비고`} maxLength={40} placeholder="외부인은 여기에 표시" value={row.note} onChange={(e) => updateRow(row.key, { note: e.target.value })} className={`mt-1 ${INPUT}`} />
                    </label>
                    <button type="button" className={buttonClass("outline", "compact", "text-destructive")} onClick={() => { setRows((c) => c.filter((r) => r.key !== row.key)); touch(); }}>삭제</button>
                  </div>
                </article>
              ))}
            </div>
            {rows.length === 0 ? (
              <div className="mt-4 rounded-md border bg-card px-4 py-8 text-center">
                <p className="text-sm font-bold">아직 참여자가 없습니다.</p>
                <p className="mt-1 text-xs text-muted-foreground">등록 멤버를 검색하거나 직접 입력으로 추가해 주세요.</p>
              </div>
            ) : null}
            <FieldError message={errors.participants} />
          </section>
        </fieldset>

        <div className="border-t py-6">
          {formError ? <p className="rounded-md border border-destructive bg-destructive-soft px-4 py-3 text-sm text-destructive" role="alert" data-testid="action-message">{formError}</p> : null}
          {submitted ? null : (
            <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row">
              <button type="button" disabled={pending} className={`w-full sm:w-auto ${buttonClass("outline")}`} onClick={() => save(false)}>
                {pending && busy === "draft" ? "저장하는 중…" : "임시 저장"}
              </button>
              <button type="button" disabled={pending} className={`w-full sm:w-auto ${buttonClass("primary")}`} onClick={() => save(true)}>
                {pending && busy === "submit" ? "저장하고 요청하는 중…" : "저장 후 검수 요청"}
              </button>
            </div>
          )}
          {success ? (
            <div className="mt-4 rounded-lg border bg-card px-4 py-4" role="status" data-testid="saved-notice">
              <p className="text-sm font-extrabold">{success.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{success.message}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {document ? <a href={document.url} download className={buttonClass("outline")} data-testid="hwpx-link">HWPX 다운로드</a> : null}
                {success.canSubmit && !submitted ? (
                  <button type="button" disabled={pending} className={buttonClass("primary")} onClick={requestReview}>{pending && busy === "request" ? "요청하는 중…" : "검수 요청"}</button>
                ) : null}
                <button type="button" className={buttonClass("outline")} onClick={reset}>새로 작성</button>
              </div>
            </div>
          ) : null}
        </div>
      </form>
    </>
  );
}
