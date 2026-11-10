import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicShell, ShareLanding } from "@/components/bandi/public-shell";
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
    <PublicShell>
      <ShareLanding title={resource.title} detailPath={`/resources/${resource.id}`} />
    </PublicShell>
  );
}
