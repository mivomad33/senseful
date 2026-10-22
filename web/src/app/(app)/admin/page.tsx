import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Card, CardTitle, Loading } from "@/components/ui";
import { db } from "@/db";
import { cardStock, generateCommand, reportList, todayGradeCounts, userCount } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { ReportItem } from "./report-item";

export const metadata: Metadata = { title: "관리자 - Senseful" };

async function Summary() {
  await requireAdmin();
  const [users, grades] = await Promise.all([userCount(db), todayGradeCounts(db)]);
  return (
    <Card className="flex flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-[14px] bg-subtle p-4">
          <span className="text-[13px] text-muted">가입자</span>
          <span className="text-[28px] leading-none font-extrabold tabular-nums">{users.toLocaleString("ko-KR")}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-subtle p-4">
          <span className="text-[13px] text-muted">오늘 판정(전체)</span>
          <span className="text-[28px] leading-none font-extrabold tabular-nums">{grades.total.toLocaleString("ko-KR")}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">사용자별 오늘 판정 · 관리자 판정은 한도와 횟수에 넣지 않습니다</span>
        {grades.byUser.length === 0 ? (
          <span className="text-muted">아직 없습니다.</span>
        ) : (
          grades.byUser.map((g) => (
            <div key={g.email} className="flex justify-between gap-3 border-t border-line py-2">
              <span className="min-w-0 truncate">{g.email}</span>
              <span className="font-bold tabular-nums">{g.count}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

const stockGrid = "grid grid-cols-[40px_repeat(4,minmax(0,1fr))] items-center gap-x-2 sm:grid-cols-[56px_repeat(4,minmax(0,1fr))]";

async function Stock() {
  await requireAdmin();
  const rows = await cardStock(db);
  const warned = rows.filter((r) => r.warn);
  return (
    <Card className="flex flex-col gap-3 px-5 py-6 sm:px-7">
      <CardTitle aside="로컬 명령으로 만듭니다">카드 재고</CardTitle>
      <div className="flex flex-col text-[13px] tabular-nums sm:text-sm">
        <div className={`${stockGrid} py-1.5 text-xs text-muted`}>
          <span>레벨</span>
          <span className="text-right">전체 항목</span>
          <span className="text-right">카드</span>
          <span className="text-right">뺀 카드</span>
          <span className="text-right" title="이 레벨을 제외하지 않은 사용자 중 새 카드가 가장 적게 남은 사용자의 남은 수">
            최소 남은 수
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.level} className={`${stockGrid} border-t border-line py-2.5`}>
            <span className="font-bold">{r.level.toUpperCase()}</span>
            <span className="text-right">{r.items.toLocaleString("ko-KR")}</span>
            <span className="text-right">{r.cards.toLocaleString("ko-KR")}</span>
            <span className="text-right">{r.excluded.toLocaleString("ko-KR")}</span>
            <span className={`text-right ${r.warn ? "font-bold text-orange-ink" : ""}`}>{r.minRemaining === null ? "—" : r.minRemaining.toLocaleString("ko-KR")}</span>
          </div>
        ))}
      </div>
      {warned.map((r) => (
        <div key={r.level} role="alert" className="flex flex-col gap-1.5 rounded-[14px] bg-orange-soft px-4 py-3.5 text-sm text-orange-ink">
          <span className="font-bold">{r.level.toUpperCase()} 카드를 더 만들어야 합니다.</span>
          <code className="overflow-x-auto rounded-lg bg-surface px-2.5 py-1.5 text-xs text-ink">{generateCommand(r.level)}</code>
        </div>
      ))}
    </Card>
  );
}

async function Reports() {
  await requireAdmin();
  const list = await reportList(db);
  return (
    <Card className="flex flex-col gap-3 px-5 py-6 sm:px-7">
      <CardTitle aside={`처리 안 함 ${list.filter((r) => !r.resolvedAt).length}건`}>신고</CardTitle>
      {list.length === 0 ? <p className="text-sm text-muted">신고가 없습니다.</p> : list.map((r) => <ReportItem key={r.id} report={r} />)}
    </Card>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 py-8 sm:py-10">
      <header className="flex items-center gap-4 px-1 pb-2">
        <Link href="/home" aria-label="홈으로" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">관리자</h1>
      </header>
      <Suspense fallback={<Loading card />}>
        <Summary />
        <Suspense fallback={<Loading card />}>
          <Stock />
        </Suspense>
        <Suspense fallback={<Loading card />}>
          <Reports />
        </Suspense>
      </Suspense>
    </main>
  );
}
