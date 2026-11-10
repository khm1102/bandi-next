"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19는 `<form action>` 제출이 끝나면 입력을 초기값으로 되돌린다. 서버가 오류를 돌려줘도 입력이 지워지므로,
 * JS가 있을 때는 직접 FormData를 만들어 액션을 호출해 사용자가 입력한 값을 유지한다 (원본 화면과 같은 동작).
 * `action` 속성도 함께 두어 JS가 없을 때의 기본 제출은 그대로 동작한다.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter ?? undefined);
    startTransition(() => dispatch(formData));
  };
}
