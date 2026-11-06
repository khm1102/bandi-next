/** 한국 시간(Asia/Seoul, UTC+9, 서머타임 없음) 변환 유틸. */
const OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "YYYY-MM-DDTHH:mm" 또는 "YYYY-MM-DD"(자정)를 KST로 해석한 Date. 잘못된 값은 Invalid Date. */
export function parseKst(value: string | null | undefined): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value?.trim() ?? "");
  if (!match) {
    return new Date(NaN);
  }
  const [, y, mo, d, h = "00", mi = "00"] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const date = new Date(utc - OFFSET_MS);
  // 2월 30일 같은 값이 다음 달로 넘어가는 것을 거부한다.
  const roundTrip = toKstDate(date);
  return roundTrip === `${y}-${mo}-${d}` ? date : new Date(NaN);
}

function parts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  };
}

export function toKstDate(date: Date): string {
  const p = parts(date);
  return `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`;
}

/** <input type="datetime-local"> 값 */
export function toKstDateTimeInput(date: Date): string {
  const p = parts(date);
  return `${toKstDate(date)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function toKstTime(date: Date): string {
  const p = parts(date);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** 해당 월(KST)의 [시작, 다음 달 시작) 구간. */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1) - OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - OFFSET_MS);
  return { start, end };
}

/** "YYYY-MM" 파싱. 없거나 잘못되면 now(KST)의 달. */
export function parseMonth(value: string | undefined, now: Date): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  const p = parts(now);
  return { year: p.y, month: p.mo };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 월간 그리드(일요일 시작)의 날짜 배열. 각 항목은 "YYYY-MM-DD"와 해당 월 소속 여부. */
export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const day = new Date(Date.UTC(year, month - 1, 1 - startOffset + i));
    return {
      date: `${pad(day.getUTCFullYear(), 4)}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      inMonth: day.getUTCMonth() === month - 1,
    };
  });
}

/** 일정(KST 기준)이 걸쳐 있는 날짜 목록. 종료는 배타(종일 일정의 다음 날 00:00은 제외). */
export function eventDays(startAt: Date, endAt: Date): string[] {
  const days: string[] = [];
  const startDay = Math.floor((startAt.getTime() + OFFSET_MS) / DAY_MS);
  const lastInstant = new Date(endAt.getTime() - 1);
  const endDay = Math.floor((lastInstant.getTime() + OFFSET_MS) / DAY_MS);
  for (let day = startDay; day <= endDay && days.length < 62; day++) {
    days.push(toKstDate(new Date(day * DAY_MS - OFFSET_MS)));
  }
  return days;
}
