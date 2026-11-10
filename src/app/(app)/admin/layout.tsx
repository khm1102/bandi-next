import type { ReactNode } from "react";
import { PageHead } from "@/components/bandi/page-head";
import { requireRole } from "@/lib/session";
import { AdminTabs } from "./admin-tabs";

/** 운영진 전용. 화면 접근을 막는 것과 별개로 모든 서비스 호출이 운영진 권한을 다시 검사한다. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("ADMIN");
  return (
    <>
      <PageHead title="운영 관리" description="동아리 현황을 보고, 화면 설정과 계정 운영을 관리합니다." />
      <AdminTabs />
      {children}
    </>
  );
}
