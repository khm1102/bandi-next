import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { resourceService } from "@/features/resource/instance";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { guard } from "@/lib/page-errors";
import { db } from "@/lib/db";
import { clientKey } from "@/lib/rate-limit";
import { hitShared } from "@/lib/rate-limit-db";

export async function generateMetadata({ params }: PageProps<"/share/resources/[token]">): Promise<Metadata> {
  const resource = await resourceService()
    .lookupPublicShare((await params).token)
    .catch(() => null);
  return { title: resource ? `${resource.title} · 반디` : "반디", robots: { index: false, follow: false }, referrer: "no-referrer", openGraph: resource ? { title: resource.title } : undefined };
}

async function throttled(): Promise<boolean> {
  const key = clientKey(await headers(), env().TRUST_PROXY);
  return !(await hitShared(db, `share:${key}`, { limit: env().TRUST_PROXY ? 60 : 600, windowMs: 60_000 })).allowed;
}

export default async function SharedResourcePage({ params }: PageProps<"/share/resources/[token]">) {
  // 토큰 대입 공격을 줄이기 위해 요청 속도를 제한한다 (초과 시 존재하지 않는 토큰과 같은 404).
  if (await throttled()) notFound();
  const resource = await guard(resourceService().lookupPublicShare((await params).token));
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">반디 자료실</p>
      <h1 className="text-2xl font-black tracking-tight">{resource.title}</h1>
      <p className="text-sm text-muted-foreground">자료 내용은 로그인한 동아리 멤버에게만 공개됩니다.</p>
      <Link href={`/login?next=${encodeURIComponent(`/resources/${resource.id}`)}`} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong">
        로그인하고 자료 보기
      </Link>
    </main>
  );
}
