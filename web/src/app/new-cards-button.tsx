"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { makeNewCards, type NewCardsState } from "./actions";

function message(s: NonNullable<NewCardsState>): string {
  if (s.error) return s.error;
  if (s.created === 0 && s.failed.length === 0) return "새로 만들 뜻이 남지 않았다.";
  return s.failed.length ? `${s.created}장 생성, ${s.failed.length}개 실패` : `${s.created}장 생성`;
}

/** 지난 시간(예: "0:37") */
function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** pending인 동안 지난 초. 1~2분 걸리는 생성이 멈춘 것처럼 보이지 않게 센다. */
function useElapsed(pending: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const t = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setSec(0); // 다음에 누를 때 0:00부터 센다
    };
  }, [pending]);
  return sec;
}

/** 홈의 새 카드 만들기 카드 내용. total: 전체 카드 수, nextLevel: 다음에 만들 레벨(남은 뜻이 없으면 null), perBatch: 한 번에 만드는 장수 */
export function NewCardsButton({ total, nextLevel, perBatch }: { total: number; nextLevel: string | null; perBatch: number }) {
  const [state, action, pending] = useActionState<NewCardsState>(() => makeNewCards(), null);
  const elapsed = useElapsed(pending);
  const failed = !!state && (!!state.error || state.failed.length > 0);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-bold">새 카드 만들기</span>
          <span className="text-[13px] text-muted">
            {pending ? "보통 1~2분 걸린다." : `전체 카드 ${total.toLocaleString("ko-KR")}장${nextLevel ? ` · 다음은 ${nextLevel.toUpperCase()}에서 ${perBatch}장` : ""}`}
          </span>
        </div>
        <Button type="submit" variant="soft" loading={pending} className="shrink-0">
          {pending ? <span className="tabular-nums">{clock(elapsed)}</span> : "만들기"}
        </Button>
      </div>
      {state && !pending && (
        <div role="status" className={`text-sm ${failed ? "text-orange-ink" : "text-muted"}`}>
          <p>{message(state)}</p>
          {state.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {state.failed.map((f, i) => (
                <li key={i}>
                  {f.headword}: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
