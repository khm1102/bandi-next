import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/session";

// 원본과 같이 루트는 로그인 여부에 따라 대시보드/로그인으로 보낸다.
export default async function Home() {
  redirect((await getPrincipal()) ? "/dashboard" : "/login");
}
