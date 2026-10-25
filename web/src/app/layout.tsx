import { Analytics } from "@vercel/analytics/next";
import { Gothic_A1 } from "next/font/google";
import { isDev } from "@/config";
import { siteMetadata } from "@/lib/meta";
import "./globals.css";

// 글꼴은 next/font가 빌드 때 받아 이 서버에서 내보낸다. 한글은 파일이 커서 미리 받지 않고, 브라우저가 화면에 쓰는 글자 묶음만 받는다.
const gothic = Gothic_A1({ weight: ["400", "500", "600", "700", "800"], preload: false, display: "swap", variable: "--font-gothic" });

export const metadata = siteMetadata;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${gothic.variable}`}>
      <body className="flex min-h-full flex-col font-sans">
        {isDev && (
          // 개발 서버임을 알린다. 운영 사이트와 헷갈리지 않게 한다.
          <div className="pointer-events-none fixed top-2 right-2 z-50 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">개발 DB</div>
        )}
        {children}
        {/* 사용 분석(Vercel Web Analytics). 쿠키 없이 익명 방문을 센다. 개발 서버에서는 보내지 않고(패키지 기본 동작), 콘솔 기록도 끈다. */}
        <Analytics debug={false} />
      </body>
    </html>
  );
}
