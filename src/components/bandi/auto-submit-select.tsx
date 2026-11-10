"use client";

import type { SelectHTMLAttributes } from "react";

/** 값이 바뀌면 소속 폼을 바로 제출하는 select (원본 캘린더·목록 필터 동작). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
