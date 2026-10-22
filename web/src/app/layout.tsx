import type { Metadata } from "next";
import { Gothic_A1 } from "next/font/google";
import path from "node:path";
import { config, isDev } from "@/config";
import "./globals.css";

// 글꼴은 next/font가 빌드 때 받아 이 서버에서 내보낸다. 한글은 파일이 커서 미리 받지 않고, 브라우저가 화면에 쓰는 글자 묶음만 받는다.
const gothic = Gothic_A1({ weight: ["400", "500", "600", "700", "800"], preload: false, display: "swap", variable: "--font-gothic" });

export const metadata: Metadata = {
  title: "Senseful",
  description: "뜻 단위 영어 번역 복습",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${gothic.variable}`}>
      <body className="min-h-full flex flex-col font-sans">
        {isDev && (
          // 개발 서버임을 알린다. 실제 앱(운영 서버)과 헷갈리지 않게 한다.
          <div className="fixed top-2 right-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            개발 DB · {path.relative(process.cwd(), config.dbPath)}
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
