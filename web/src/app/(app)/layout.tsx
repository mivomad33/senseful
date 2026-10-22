import type { Metadata } from "next";
import { Footer } from "@/components/footer";

// 로그인한 뒤의 화면(홈, 학습, 설정, 관리자). 검색엔진이 수집하지 않는다.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <Footer className="mt-auto px-4 pt-6 pb-8" />
    </>
  );
}
