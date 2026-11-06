"use client";

import { useEffect } from "react";

/** 설치형 앱 등록만 한다. 서비스 워커는 네트워크 전용이라 화면·API·파일을 캐시하지 않는다. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {
      // 설치형 앱 등록 실패는 일반 웹 사용을 막지 않는다.
    });
  }, []);
  return null;
}
