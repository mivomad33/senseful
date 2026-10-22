// 개인정보 처리방침(문서 4.5-2). Google OAuth 브랜딩에 등록한 주소(/privacy)다. 정적 페이지다.
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Card, Logo } from "@/components/ui";
import { CONTACT_EMAIL } from "@/config";
import { publicPage } from "@/lib/meta";

export const metadata: Metadata = publicPage("/privacy", "개인정보 처리방침 - Senseful");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="flex flex-col gap-2 leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <>
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 py-8 sm:py-10">
      <header className="px-1 pb-2">
        <Link href="/" aria-label="Senseful 처음으로">
          <Logo />
        </Link>
      </header>
      <Card className="flex flex-col gap-6 px-5 py-7 sm:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold">개인정보 처리방침</h1>
          <p className="text-sm text-muted">시행일: 2026년 10월 22일</p>
        </div>
        <p className="leading-relaxed text-muted">Senseful(이하 &quot;서비스&quot;)은 영단어 학습에 꼭 필요한 정보만 저장하고, 학습 기능을 위해서만 씁니다.</p>
        <Section title="1. 저장하는 정보">
          <ul>
            <li>구글 계정의 이메일, 이름, 프로필 사진(구글로 로그인할 때 받습니다)</li>
            <li>학습 기록: 카드별 학습 상태와 복습 일정, 답할 때마다의 판정 결과와 시각</li>
            <li>입력한 답안(예문 번역)</li>
            <li>카드 오류 신고 내용, 학습 설정(하루 새 카드 수, 제외한 레벨)</li>
            <li>로그인을 유지하기 위한 세션 정보(쿠키)</li>
          </ul>
        </Section>
        <Section title="2. 쓰는 곳">
          <ul>
            <li>로그인과 계정 구분, 학습 일정 계산, 학습 기록과 통계 표시 등 학습 기능에만 씁니다.</li>
            <li>답안이 맞았는지 판정하기 위해 답안과 카드 내용을 Anthropic의 Claude API로 보냅니다. 이메일 등 계정 정보는 함께 보내지 않습니다.</li>
            <li>카드 오류 신고는 개발자가 카드 내용을 고치는 데 씁니다.</li>
            <li>광고, 마케팅, 다른 회사에 판매하는 데에는 쓰지 않습니다.</li>
          </ul>
        </Section>
        <Section title="3. 맡기는 곳">
          <ul>
            <li>Vercel: 서비스 호스팅</li>
            <li>Neon: 데이터베이스(싱가포르 리전)</li>
            <li>Anthropic: 답안 판정(Claude API)</li>
            <li>Google: 로그인</li>
          </ul>
        </Section>
        <Section title="4. 보관과 삭제">
          <p>계정이 있는 동안 보관합니다. 설정 화면에서 탈퇴하면 계정과 학습 기록, 답안, 신고 내용이 바로 모두 지워집니다.</p>
          <p>하루 전체 판정 횟수처럼 개인과 연결되지 않는 집계는 탈퇴 뒤에도 남을 수 있습니다.</p>
        </Section>
        <Section title="5. 연락처">
          <p>
            개인정보 열람·삭제 요청이나 문의는{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-link underline-offset-[3px] hover:underline">
              {CONTACT_EMAIL}
            </a>
            로 보내 주세요.
          </p>
        </Section>
      </Card>
    </main>
    <Footer className="px-4 pt-2 pb-8" />
    </>
  );
}
