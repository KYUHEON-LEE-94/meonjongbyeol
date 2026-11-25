import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import AppShell from "@/app/components/AppShell";
import PwaServiceWorker from "@/app/components/PwaServiceWorker";
import { getSiteUrl } from "@/lib/og/siteUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 숫자·라틴 헤드라인 전용(font-display). 한글은 기존 시스템 고딕 스택을 그대로 쓴다.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  // OG 이미지는 절대 URL 이어야 크롤러가 읽는다. 운영에서는 SITE_URL 을 등록한다.
  metadataBase: getSiteUrl(),
  title: "먼종별",
  description: "먼가 종겜하는 별난 것들 — 종겜방 멤버 전용 내전·스팀·롤 랭킹 커뮤니티",
  openGraph: {
    type: "website",
    siteName: "먼종별",
    locale: "ko_KR",
    title: "먼종별",
    description: "먼가 종겜하는 별난 것들 — 종겜방 멤버 전용 내전·스팀·롤 랭킹 커뮤니티",
  },
  twitter: { card: "summary_large_image" },
  manifest: "/manifest.webmanifest",
  // iOS 는 홈 화면에 추가한 PWA 안에서만 웹 푸시를 지원한다(iOS 16.4+).
  appleWebApp: { capable: true, title: "먼종별", statusBarStyle: "black-translucent" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="ko" suppressHydrationWarning>
      <head>
        {/* FOUC 방지: paint 이전에 localStorage → 없으면 matchMedia 로 data-theme 를 심는다.
            next/script 는 실행 시점 보장이 약해 flash 가 생기므로 raw 인라인 스크립트를 쓴다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var t=localStorage.getItem('theme');` +
              `var d=t||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');` +
              `document.documentElement.setAttribute('data-theme',d);}catch(e){` +
              `document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body
          className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased`}
          suppressHydrationWarning
      >
      <PwaServiceWorker />
      <AppShell>{children}</AppShell>
      </body>
      </html>
  );
}
