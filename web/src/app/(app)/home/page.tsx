import { Suspense } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/button";
import { NoNewCardsNotice } from "@/components/notices";
import { Card, CardTitle, Loading, Logo } from "@/components/ui";
import { db } from "@/db";
import { requireUser, studyUser } from "@/lib/auth/current";
import { weekday } from "@/lib/day";
import { waitingText } from "@/lib/format";
import { todayCounts, type TodayCounts } from "@/lib/study/schedule";
import { daysLeft, FORECAST_BUCKETS, formatDays, levelStats, MATURE_DAYS, percent, reviewForecast, studyHistory } from "@/lib/study/stats";
import { logout, studyMoreNewFromHome } from "../actions";

/** 홈 머리: 로고, 연속 학습일, 설정·관리자·로그아웃 */
async function Header() {
  const u = await requireUser();
  const { streak } = await studyHistory(db, u.id);
  const link = "rounded-lg px-2 py-1 text-sm text-muted hover:text-ink";
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2">
      <div className="flex items-baseline gap-3">
        <h1>
          <Logo />
        </h1>
        {streak > 0 && <span className="text-sm text-muted">연속 {streak}일째 학습 중</span>}
      </div>
      <nav className="-mr-2 flex items-center">
        <Link href="/settings" className={link}>
          설정
        </Link>
        {u.isAdmin && (
          <Link href="/admin" className={link}>
            관리자
          </Link>
        )}
        <form action={logout}>
          <button type="submit" className={link}>
            로그아웃
          </button>
        </form>
      </nav>
    </header>
  );
}

/** 오늘 남은 카드 수 하나(복습·새 카드·다시 볼 카드) */
function Tile({ label, n, tone }: { label: string; n: number; tone: "blue" | "violet" | "plain" }) {
  const tones = {
    blue: ["bg-blue-soft", "text-blue-ink", "text-blue"],
    violet: ["bg-violet-soft", "text-violet-ink", "text-violet"],
    plain: ["bg-subtle", "text-muted", "text-muted"],
  }[tone];
  return (
    <div className={`flex flex-col gap-1.5 rounded-[14px] p-3 sm:p-4 ${tones[0]}`}>
      <span className={`text-[13px] ${tones[1]}`}>{label}</span>
      <span className={`text-[28px] leading-none font-extrabold tabular-nums sm:text-[32px] ${tones[2]}`}>{n}</span>
    </div>
  );
}

async function Today() {
  const u = await requireUser();
  const c = await todayCounts(db, studyUser(u));
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-7">
      <h2 className="text-lg font-bold">오늘의 학습</h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile label="복습" n={c.review} tone="blue" />
        <Tile label="새 카드" n={c.new} tone="violet" />
        <Tile label="다시 볼 카드" n={c.learning} tone="plain" />
      </div>
      <NextAction c={c} />
      {c.newTotal === 0 && <NoNewCardsNotice />}
    </Card>
  );
}

const arrow = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** 오늘 상태에 따른 버튼(개요 문서 5.3): 학습 시작 → 기다리지 않고 바로 보기 → 새 카드 더 학습 */
function NextAction({ c }: { c: TodayCounts }) {
  if (c.ready > 0) {
    return (
      <Link href="/study" className={buttonStyles("primary")}>
        학습 시작 {arrow}
      </Link>
    );
  }
  if (c.waitingUntil !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{waitingText(c.waitingUntil)}</p>
        <Link href="/study?ahead=1" className={buttonStyles("primary")}>
          기다리지 않고 바로 보기
        </Link>
      </div>
    );
  }
  if (c.moreNew > 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">오늘 학습할 카드를 모두 끝냈습니다.</p>
        <form action={studyMoreNewFromHome} className="flex flex-col">
          <Button type="submit">새 카드 {c.moreNew}장 더 학습</Button>
        </form>
      </div>
    );
  }
  return (
    <p className="text-sm text-muted">
      오늘 학습할 카드가 없습니다.{c.restNew > 0 && " 남은 새 카드는 오늘 학습한 단어의 다른 뜻이라 내일 나옵니다."}
    </p>
  );
}

/** 정답률(소수점 없이). 답이 없으면 빈칸 */
function accuracy(correct: number, answers: number): string {
  return answers ? `${Math.round((correct / answers) * 100)}%` : "–";
}

const historyGrid = "grid grid-cols-[44px_repeat(7,minmax(0,1fr))_44px] items-center sm:grid-cols-[64px_repeat(7,minmax(0,1fr))_56px]";

/** 학습 기록의 한 줄: 이름, 요일별 값 7개, 합계 */
function HistoryRow({ label, cells, total, small }: { label: string; cells: { v: string; empty: boolean }[]; total: string; small?: boolean }) {
  return (
    <div className={`${historyGrid} border-t border-line py-3.5`}>
      <span className="text-[13px] text-muted">{label}</span>
      {cells.map((c, i) => (
        <span key={i} className={`text-center ${small ? "text-xs sm:text-[13px]" : "font-bold"} ${c.empty ? "text-faint" : small ? "text-muted" : ""}`}>
          {c.v}
        </span>
      ))}
      <span className={`text-right ${small ? "text-xs text-muted sm:text-[13px]" : "font-extrabold"}`}>{total}</span>
    </div>
  );
}

/** 최근 7일 학습 기록. 왼쪽이 오래된 날, 오른쪽 끝이 오늘이다. */
async function HistoryTable() {
  const u = await requireUser();
  const days = (await studyHistory(db, u.id)).days.toReversed();
  const sum = (k: "answers" | "newCards" | "reviewCards" | "correct") => days.reduce((a, d) => a + d[k], 0);
  const cells = (f: (d: (typeof days)[number]) => string) => days.map((d) => ({ v: d.answers ? f(d) : "–", empty: !d.answers }));
  const last = days.length - 1;
  return (
    <Card className="flex flex-col gap-4 px-5 py-6 sm:px-7">
      <CardTitle aside="최근 7일">학습 기록</CardTitle>
      <div className="flex flex-col tabular-nums">
        <div className={`${historyGrid} pb-3 text-xs text-muted`}>
          <span />
          {days.map((d, i) => (
            <span key={d.day} className={`text-center ${i === last ? "font-bold text-ink" : ""}`}>
              {i === last ? "오늘" : weekday(d.date)}
            </span>
          ))}
          <span className="text-right">합계</span>
        </div>
        <HistoryRow label="새 카드" cells={cells((d) => String(d.newCards))} total={String(sum("newCards"))} />
        <HistoryRow label="복습" cells={cells((d) => String(d.reviewCards))} total={String(sum("reviewCards"))} />
        <HistoryRow label="정답률" cells={cells((d) => accuracy(d.correct, d.answers))} total={accuracy(sum("correct"), sum("answers"))} small />
      </div>
    </Card>
  );
}

const LEVEL_COLUMNS = [
  ["items", "전체 뜻"],
  ["cards", "카드"],
  ["studied", "학습함"],
  ["mature", "익숙함"],
] as const;

/** 레벨 꼬리표(예: A1) */
function Level({ children }: { children: string }) {
  return <span className="inline-block min-w-8 rounded-full bg-page px-2 py-0.5 text-center text-xs font-bold">{children}</span>;
}

/** 개수와, total이 있으면 그 레벨 전체 뜻 대비 퍼센트(휴대폰 폭에서는 퍼센트를 줄인다) */
function Count({ n, total }: { n: number; total?: number }) {
  return (
    <>
      {n.toLocaleString("ko-KR")}
      {total !== undefined && n > 0 && <span className="ml-1 hidden text-xs text-muted sm:inline">{percent(n, total)}</span>}
    </>
  );
}

const levelGrid = "grid grid-cols-[40px_repeat(4,minmax(0,1fr))_72px] items-center gap-x-1 sm:grid-cols-[56px_repeat(4,minmax(0,1fr))_96px]";

/** 레벨별 학습 현황. 제외한 레벨은 "제외"로 보이고 남은 기간을 계산하지 않는다. */
async function LevelTable() {
  const u = await requireUser();
  const rows = await levelStats(db, u);
  const total = Object.fromEntries(LEVEL_COLUMNS.map(([k]) => [k, rows.reduce((a, r) => a + r[k], 0)])) as Record<(typeof LEVEL_COLUMNS)[number][0], number>;
  const totalRemaining = rows.filter((r) => !r.excluded).reduce((a, r) => a + r.remaining, 0);
  const left = (remaining: number) => formatDays(daysLeft(remaining, u.newPerDay));
  return (
    <Card className="flex flex-col gap-3 px-5 py-6 sm:px-7">
      <CardTitle>레벨별 현황</CardTitle>
      <div className="flex flex-col text-[13px] tabular-nums sm:text-sm">
        <div className={`${levelGrid} py-1.5 text-xs text-muted`}>
          <span>레벨</span>
          {LEVEL_COLUMNS.map(([k, label]) => (
            <span key={k} className="text-right" title={k === "mature" ? `다음 복습까지 ${MATURE_DAYS}일 이상 남은 카드` : undefined}>
              {label}
            </span>
          ))}
          <span className="text-right" title={`매일 새 카드 ${u.newPerDay}장씩 학습할 때 아직 학습하지 않은 뜻을 처음 다 보는 데 걸리는 기간`}>
            남은 기간
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.level} className={`${levelGrid} border-t border-line py-2.5`}>
            <span>
              <Level>{r.level.toUpperCase()}</Level>
            </span>
            {LEVEL_COLUMNS.map(([k]) => (
              <span key={k} className="text-right">
                <Count n={r[k]} total={k === "items" ? undefined : r.items} />
              </span>
            ))}
            <span className="text-right text-muted">{r.excluded ? "제외" : left(r.remaining)}</span>
          </div>
        ))}
        <div className={`${levelGrid} border-t border-line py-2.5 font-bold`}>
          <span>합계</span>
          {LEVEL_COLUMNS.map(([k]) => (
            <span key={k} className="text-right">
              <Count n={total[k]} total={k === "items" ? undefined : total.items} />
            </span>
          ))}
          <span className="text-right">{left(totalRemaining)}</span>
        </div>
      </div>
    </Card>
  );
}

const forecastGrid = "grid grid-cols-[40px_repeat(5,minmax(0,1fr))] items-center gap-x-1 sm:grid-cols-[56px_repeat(5,minmax(0,1fr))]";

/** 앞으로의 복습 예정(레벨별·구간별 카드 수). 오늘 몫은 위의 오늘의 학습에 있다. */
async function ForecastTable() {
  const u = await requireUser();
  const rows = await reviewForecast(db, u.id);
  const total = FORECAST_BUCKETS.map((_, i) => rows.reduce((a, r) => a + r.counts[i], 0));
  const cell = (n: number) => (n ? n.toLocaleString("ko-KR") : <span className="text-faint">0</span>);
  return (
    <Card className="flex flex-col gap-3 px-5 py-6 sm:px-7">
      <CardTitle>복습 예정</CardTitle>
      <div className="flex flex-col text-[13px] tabular-nums sm:text-sm">
        <div className={`${forecastGrid} py-1.5 text-xs text-muted`}>
          <span>레벨</span>
          {FORECAST_BUCKETS.map((b) => (
            <span key={b.label} className="text-right">
              {b.label}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.level} className={`${forecastGrid} border-t border-line py-2.5`}>
            <span>
              <Level>{r.level.toUpperCase()}</Level>
            </span>
            {r.counts.map((n, i) => (
              <span key={i} className="text-right">
                {cell(n)}
              </span>
            ))}
          </div>
        ))}
        <div className={`${forecastGrid} border-t border-line py-2.5 font-bold`}>
          <span>합계</span>
          {total.map((n, i) => (
            <span key={i} className="text-right">
              {cell(n)}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-4 px-4 py-8 sm:py-10">
      <Suspense fallback={<Loading />}>
        <Header />
        <Suspense fallback={<Loading card />}>
          <Today />
        </Suspense>
        <Suspense>
          <HistoryTable />
        </Suspense>
        <Suspense>
          <LevelTable />
        </Suspense>
        <Suspense>
          <ForecastTable />
        </Suspense>
      </Suspense>
    </main>
  );
}

