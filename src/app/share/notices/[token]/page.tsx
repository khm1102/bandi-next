import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { noticeService } from "@/features/notice/instance";
import { NoticeNotFoundError } from "@/features/notice/model";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { clientKey } from "@/lib/rate-limit";
import { hitShared } from "@/lib/rate-limit-db";

// 공유 페이지는 색인되지 않고, 제목 외에는 아무 정보도 공개하지 않는다.
async function load(token: string) {
  return noticeService()
    .lookupPublicShare(token)
    .catch((error: unknown) => {
      if (error instanceof NoticeNotFoundError) notFound();
      throw error;
    });
}

export async function generateMetadata({ params }: PageProps<"/share/notices/[token]">): Promise<Metadata> {
  const notice = await noticeService()
    .lookupPublicShare((await params).token)
    .catch(() => null);
  return { title: notice ? `${notice.title} · 반디` : "반디", robots: { index: false, follow: false }, referrer: "no-referrer", openGraph: notice ? { title: notice.title } : undefined };
}

async function throttled(): Promise<boolean> {
  const key = clientKey(await headers(), env().TRUST_PROXY);
  return !(await hitShared(db, `share:${key}`, { limit: env().TRUST_PROXY ? 60 : 600, windowMs: 60_000 })).allowed;
}

export default async function SharedNoticePage({ params }: PageProps<"/share/notices/[token]">) {
  // 토큰 대입 공격을 줄이기 위해 요청 속도를 제한한다 (초과 시 존재하지 않는 토큰과 같은 404).
  if (await throttled()) notFound();
  const notice = await load((await params).token);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">반디 공지</p>
      <h1 className="text-2xl font-black tracking-tight">{notice.title}</h1>
      <p className="text-sm text-muted-foreground">공지 내용은 로그인한 동아리 멤버에게만 공개됩니다.</p>
      <Link href={`/login?next=${encodeURIComponent(`/notices/${notice.id}`)}`} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
        로그인하고 공지 보기
      </Link>
    </main>
  );
}
