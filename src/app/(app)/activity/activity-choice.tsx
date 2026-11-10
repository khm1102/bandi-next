"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/bandi/button";
import { Modal } from "@/components/bandi/modal";

const CHOICE = "rounded-lg border bg-card p-4 text-left transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring";

/** 원본 list.jsp의 "활동 기록 작성" 선택 모달. */
export function ActivityChoice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass("primary")} onClick={() => setOpen(true)}>+ 활동 기록</button>
      <Modal open={open} onClose={() => setOpen(false)} title="활동 기록 작성" description="작성 방식에 따라 필요한 정보와 검수 기준이 달라요.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/activity/new" className={CHOICE}>
            <b className="block text-sm">간단 활동 기록</b>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">제목·일시·참여 인원·내용과 선택 첨부를 기록해요.</span>
          </Link>
          <Link href="/activity-documents" className={CHOICE}>
            <b className="block text-sm">한글 내역서 만들기</b>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">네이비즘 사진을 포함한 HWPX 내역서를 만들어요.</span>
          </Link>
        </div>
      </Modal>
    </>
  );
}
