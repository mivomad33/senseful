// 로그인 전 소개 화면(문서 4.5-1, 확정 시안 D). 요청마다 DB를 부르지 않는 정적 페이지다.
// 로그인한 사용자는 proxy가 홈으로 보낸다.
import type { Metadata } from "next";
import { Suspense } from "react";
import { buttonStyles } from "@/components/button";
import { Footer } from "@/components/footer";
import { Badge, Card, Logo } from "@/components/ui";
import { SITE_URL } from "@/config";
import { DESCRIPTION, publicPage } from "@/lib/meta";
import { FLOW_ANSWER, FLOW_SENSES } from "./_landing/content";
import { DemoCard } from "./_landing/demo";
import { LoginError } from "./_landing/login-error";

export const metadata: Metadata = publicPage("/", "Senseful - 영단어를 뜻 하나씩, 번역하며 암기");

const LOGIN = "/api/auth/login";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Senseful",
  description: DESCRIPTION,
  url: `${SITE_URL}/`,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "ko",
  offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
};

function GoogleMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-white">
      <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
        <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
      </svg>
    </span>
  );
}

function GoogleButton({ className = "" }: { className?: string }) {
  return (
    <a href={LOGIN} className={buttonStyles("primary", `gap-2.5 px-[22px] ${className}`)}>
      <GoogleMark />
      Google로 시작하기
    </a>
  );
}

const check = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** 흐름 구간 한 줄: 왼쪽 설명, 오른쪽 작은 화면 예시 */
function FlowRow({ n, title, children, mock }: { n: string; title: string; children: React.ReactNode; mock: React.ReactNode }) {
  return (
    <Card className="grid items-center gap-[18px] p-[18px] min-[421px]:p-[22px] min-[861px]:grid-cols-[0.9fr_1.1fr] min-[861px]:gap-7 min-[861px]:p-7">
      <div>
        <div className="text-[13px] font-extrabold text-violet">{n}</div>
        <h2 className="mt-1.5 mb-2 text-[22px] font-bold tracking-tight">{title}</h2>
        <p className="leading-[1.65] text-muted">{children}</p>
      </div>
      <div className="rounded-2xl bg-page p-3 min-[421px]:p-[18px]">{mock}</div>
    </Card>
  );
}

const mini = "overflow-hidden rounded-[14px] bg-surface shadow-card";

export default function Landing() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1040px] px-4 pt-[18px] pb-9 min-[421px]:px-5 min-[421px]:pt-6 min-[421px]:pb-12">
        <div className="flex items-center justify-between">
          <Logo />
          <a href={LOGIN} className={buttonStyles("secondary", "h-10 rounded-[10px] px-3.5 text-sm")}>
            로그인
          </a>
        </div>

        <section className="mt-9 grid items-center gap-8 min-[861px]:mt-16 min-[861px]:grid-cols-[1fr_1.1fr] min-[861px]:gap-14">
          <div>
            <h1 className="mb-4 text-[30px] leading-[1.2] font-extrabold tracking-[-0.04em] min-[421px]:text-[34px] min-[861px]:text-[46px]">
              영단어를 뜻 하나씩,
              <br />
              번역하며 암기
            </h1>
            <p className="mb-8 text-base leading-[1.6] text-muted min-[421px]:text-lg">예문을 번역하면 AI가 맞았는지 판정하고, 복습 날짜는 알아서 잡아 드립니다.</p>
            <div className="flex flex-col gap-3 min-[861px]:max-w-[340px]">
              <Suspense>
                <LoginError />
              </Suspense>
              <GoogleButton />
              <span className="text-[13px] text-hint">
                로그인하면 학습 기록이 저장됩니다.{" "}
                <a href="/privacy" className="text-hint underline">
                  개인정보 처리방침
                </a>
              </span>
            </div>
          </div>
          <div>
            <DemoCard />
            <p className="mt-3.5 text-center text-[13px] text-hint">실제 학습 화면과 같습니다. 체험에서는 미리 정해 둔 답으로만 판정합니다.</p>
          </div>
        </section>

        <section className="mt-14 flex flex-col gap-5 min-[861px]:mt-[88px]">
          <FlowRow
            n="01 · 뜻 하나, 카드 한 장"
            title="단어가 아니라 뜻을 암기"
            mock={
              <div className="grid gap-3 min-[421px]:grid-cols-2">
                {FLOW_SENSES.map((s) => (
                  <div key={s.level} className={mini}>
                    <div className="flex flex-col gap-2.5 px-[18px] py-4">
                      <div>
                        <Badge>{s.level}</Badge>
                      </div>
                      <div lang="en" className="text-base leading-[1.4] font-bold">
                        {s.en[0]}
                        <span className="rounded bg-blue-soft px-0.5">{s.en[1]}</span>
                        {s.en[2]}
                      </div>
                      <div className="text-[13px] text-muted">
                        <b lang="en" className="text-ink">
                          run
                        </b>{" "}
                        — {s.sense}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            run 하나에도 &quot;달리다&quot;와 &quot;운영하다&quot;가 따로 있습니다. 뜻마다 그 뜻이 드러나는 예문 카드가 쉬운 레벨부터 나옵니다.
          </FlowRow>

          <FlowRow
            n="02 · 의미로 판정"
            title="AI가 정답 자동 판정"
            mock={
              <div className={mini}>
                <div className="flex items-center justify-between gap-3 bg-blue-soft px-[18px] py-3">
                  <span className="flex items-center">
                    <span className="flex size-[26px] items-center justify-center rounded-full bg-blue text-surface">{check}</span>
                    <span className="ml-2 text-[17px] font-extrabold text-blue-ink">맞음</span>
                  </span>
                  <span className="text-xs text-blue-ink">다음 복습 2일 뒤</span>
                </div>
                <div className="flex flex-col gap-2.5 px-[18px] py-4">
                  <div className="rounded-xl bg-subtle px-3.5 py-3 text-[15px]">{FLOW_ANSWER}</div>
                  <div className="text-[13px] text-muted">표현은 달라도 문장 전체의 의미가 정답과 같습니다.</div>
                </div>
              </div>
            }
          >
            AI가 문장의 의미로 판정합니다. 말투나 어순이 달라도 뜻이 같으면 맞음입니다. 판정이 아쉬우면 바로 정정할 수 있습니다.
          </FlowRow>

          <FlowRow
            n="03 · 잊기 전에 다시"
            title="복습 일정 자동 관리"
            mock={
              <div className={mini}>
                <div className="px-[18px] py-4">
                  <table className="w-full border-collapse text-[13px] tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:px-1.5 [&_td]:py-2 [&_td]:text-right [&_td:first-child]:text-left [&_th]:border-b [&_th]:border-line [&_th]:px-1.5 [&_th]:py-2 [&_th]:text-right [&_th]:font-semibold [&_th]:text-muted [&_th:first-child]:text-left">
                    <thead>
                      <tr>
                        <th>복습 예정</th>
                        <th>내일</th>
                        <th>2~7일</th>
                        <th>8~30일</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <b className="font-extrabold">A1</b>
                        </td>
                        <td>12</td>
                        <td>31</td>
                        <td>48</td>
                      </tr>
                      <tr>
                        <td>
                          <b className="font-extrabold">A2</b>
                        </td>
                        <td>6</td>
                        <td>17</td>
                        <td>9</td>
                      </tr>
                      <tr>
                        <td>
                          <b className="font-extrabold">합계</b>
                        </td>
                        <td>
                          <b className="font-extrabold">18</b>
                        </td>
                        <td>
                          <b className="font-extrabold">48</b>
                        </td>
                        <td>
                          <b className="font-extrabold">57</b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            }
          >
            맞히면 복습 간격이 점점 길어지고, 틀리면 금방 다시 나옵니다. 간격 반복 알고리즘(FSRS)이 정해 주니 오늘 나온 카드만 하면 됩니다.
          </FlowRow>
        </section>

        <section className="pt-16 pb-2 text-center">
          <h2 className="mb-5 text-[26px] font-bold tracking-tight">하루 10장부터</h2>
          <GoogleButton className="w-full min-[861px]:w-auto min-[861px]:min-w-[300px]" />
        </section>

        <Footer className="mt-10" />
      </div>
    </>
  );
}
