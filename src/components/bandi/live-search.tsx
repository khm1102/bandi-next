"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * 원본 목록 화면의 즉시 검색: 입력을 멈추고 300ms 뒤 `?q=`를 갱신해 서버에서 다시 조회한다 (페이지는 1로 되돌린다).
 * 감싸는 <form>이 있으면 Enter 제출도 그대로 동작한다.
 */
export function LiveSearch({ param = "q", defaultValue = "", delay = 300, ...rest }: { param?: string; defaultValue?: string; delay?: number } & Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name" | "value" | "onChange">) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onChange(next: string) {
    setValue(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const params = new URLSearchParams(current.toString());
      const text = next.trim();
      if (text) params.set(param, text);
      else params.delete(param);
      params.delete("page");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, delay);
  }

  return <input {...rest} name={param} type="search" value={value} onChange={(e) => onChange(e.target.value)} />;
}
