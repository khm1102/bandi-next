"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 768px) and (hover: hover) and (pointer: fine)";
const INPUT = "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 md:text-sm";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function subscribe(callback: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

function split(value: string): { date: string; time: string } {
  const matched = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value);
  return { date: matched?.[1] ?? "", time: matched?.[2] ?? "" };
}

/** 원본 vanilla-calendar-pro(ko-KR, 월요일 시작) 대응 달력 팝업. */
function CalendarPopup({ selected, onPick, onClose }: { selected: string; onPick: (date: string) => void; onClose: () => void }) {
  const today = new Date();
  const base = DATE_PATTERN.test(selected) ? selected : iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const [year, setYear] = useState(Number(base.slice(0, 4)));
  const [month, setMonth] = useState(Number(base.slice(5, 7)));
  const todayIso = iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7; // 월요일 시작
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const total = Math.ceil((offset + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
      return { date: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), inMonth: d.getUTCMonth() === month - 1, day: d.getUTCDate() };
    });
  }, [year, month]);
  const shift = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border bg-card p-3 shadow-lg" role="dialog" aria-label="날짜 선택 달력" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="flex items-center justify-between gap-2" aria-label="달력 이동">
        <button type="button" className="flex size-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="이전 달" onClick={() => shift(-1)}>‹</button>
        <b className="text-sm">{year}년 {month}월</b>
        <button type="button" className="flex size-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="다음 달" onClick={() => shift(1)}>›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-xs font-bold text-muted-foreground" aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 text-center text-sm" role="grid" aria-label="날짜 목록">
        {cells.map((cell) => (
          <button
            key={cell.date}
            type="button"
            onClick={() => onPick(cell.date)}
            aria-pressed={cell.date === selected}
            className={`m-0.5 flex size-9 items-center justify-center rounded-md ${cell.date === selected ? "bg-primary font-bold text-primary-foreground" : cell.date === todayIso ? "border border-primary font-bold hover:bg-secondary" : cell.inMonth ? "hover:bg-secondary" : "text-muted-foreground/60 hover:bg-secondary"}`}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 원본 dateTimeField.tag: 데스크톱은 날짜 텍스트 + 달력 팝업 + 시간 입력으로 분리하고,
 * 모바일은 기본 datetime-local(date) 입력을 쓴다. 폼에는 `name` 하나로 "YYYY-MM-DDTHH:mm"(종일이면 "YYYY-MM-DD")을 제출한다.
 */
export function DateTimeField({ id, name, label, required = false, minuteStep = 5, defaultValue = "", dateOnly = false, srOnlyLabel = false }: {
  id?: string;
  name: string;
  label: string;
  required?: boolean;
  minuteStep?: number;
  defaultValue?: string;
  dateOnly?: boolean;
  srOnlyLabel?: boolean;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const desktop = useDesktop();
  const initial = split(defaultValue);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const combined = dateOnly ? date : date && time ? `${date}T${time}` : "";
  const enhanced = desktop;
  // 모바일 기본 입력은 같은 date/time 상태에서 값을 만든다 (종일 전환 시에도 자동으로 맞춰진다).
  const nativeValue = dateOnly ? date : date ? `${date}T${time || "09:00"}` : "";

  return (
    <fieldset className="relative min-w-0" ref={root} data-date-time-field>
      <legend className={srOnlyLabel ? "sr-only" : "mb-1.5 text-xs font-extrabold text-muted-foreground"}>
        {label}
        {required ? <span className="text-accent-foreground"> *</span> : null}
      </legend>
      {enhanced ? (
        <>
          <input type="hidden" name={name} value={combined} />
          <div className={`grid grid-cols-1 gap-2 ${dateOnly ? "" : "md:grid-cols-2"}`}>
            <div className="relative">
              <label className="sr-only" htmlFor={`${fieldId}Date`}>{label} 날짜</label>
              <input
                id={`${fieldId}Date`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="연도. 월. 일."
                className={INPUT}
                value={date}
                required={required}
                pattern="\d{4}-\d{2}-\d{2}"
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onChange={(e) => setDate(e.target.value.trim())}
              />
              {open ? <CalendarPopup selected={date} onPick={(picked) => { setDate(picked); setOpen(false); }} onClose={() => setOpen(false)} /> : null}
            </div>
            {dateOnly ? null : (
              <div>
                <label className="sr-only" htmlFor={`${fieldId}Time`}>{label} 시간</label>
                <input id={`${fieldId}Time`} type="time" step={minuteStep * 60} className={INPUT} value={time} required={required} onChange={(e) => setTime(e.target.value)} />
              </div>
            )}
          </div>
        </>
      ) : (
        <input
          id={fieldId}
          name={name}
          type={dateOnly ? "date" : "datetime-local"}
          step={dateOnly ? undefined : minuteStep * 60}
          className={INPUT}
          value={nativeValue}
          required={required}
          onChange={(e) => {
            const parts = split(e.target.value);
            setDate(parts.date);
            setTime(parts.time);
          }}
        />
      )}
    </fieldset>
  );
}
