import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  weight: ["400", "500", "700", "800", "900"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "반디",
  description: "연극 동아리 반디 운영 서비스",
  icons: { icon: "/images/favicon.svg" },
  appleWebApp: { capable: true, title: "반디" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
