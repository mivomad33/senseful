"use client";

import { useState, useTransition } from "react";
import { Button, Spinner } from "@/components/button";
import { Card } from "@/components/ui";
import type { Level } from "@/lib/study/schedule";
import { updateSettings, withdraw } from "../actions";

const LEVELS: Level[] = ["a1", "a2", "b1", "b2", "c1"];

/** 하루 새 카드 수와 레벨 제외(문서 4.2-6). 저장하면 그날 오늘의 학습에 바로 반영된다. */
export function SettingsForm({ initial, min, max }: { initial: { newPerDay: number; excludedLevels: Level[] }; min: number; max: number }) {
  const [perDay, setPerDay] = useState(String(initial.newPerDay));
  const [excluded, setExcluded] = useState<Level[]>(initial.excludedLevels);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (l: Level) => {
    setMsg(null);
    setExcluded((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));
  };
  const allExcluded = excluded.length >= LEVELS.length;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateSettings({ newPerDay: Number(perDay), excludedLevels: excluded });
      setMsg(r.ok ? { ok: true, text: "저장했습니다. 오늘의 학습에 바로 반영됩니다." } : { ok: false, text: r.error });
    });
  };

  return (
    <Card className="flex flex-col gap-6 px-5 py-6 sm:px-7">
      <form onSubmit={save} className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="font-bold">하루 새 카드 수</span>
          <span className="text-[13px] text-muted">
            매일 새로 배우는 카드 수입니다({min}~{max}장). 오늘 학습을 다 끝낸 뒤에는 &quot;새 카드 더 학습&quot;으로 더 볼 수 있습니다.
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              required
              value={perDay}
              onChange={(e) => {
                setMsg(null);
                setPerDay(e.target.value);
              }}
              className="w-24 rounded-[14px] border-2 border-transparent bg-subtle px-4 py-2.5 text-[17px] tabular-nums outline-none focus:border-blue focus:bg-surface"
            />
            <span className="text-muted">장</span>
          </div>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-bold">학습할 레벨</legend>
          <span className="text-[13px] text-muted">끈 레벨은 새 카드가 나오지 않습니다. 이미 학습한 카드의 복습은 계속됩니다. 하나 이상 남겨야 합니다.</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const on = !excluded.includes(l);
              return (
                <label
                  key={l}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold has-focus-visible:ring-2 has-focus-visible:ring-blue ${on ? "border-blue bg-blue-soft text-blue-ink" : "border-edge bg-surface text-muted"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(l)} className="accent-blue" />
                  {l.toUpperCase()}
                </label>
              );
            })}
          </div>
          {allExcluded && (
            <p role="alert" className="text-sm text-orange-ink">
              레벨을 모두 제외할 수는 없습니다. 하나 이상 남겨 주세요.
            </p>
          )}
        </fieldset>
        <Button type="submit" loading={pending} disabled={allExcluded}>
          {pending ? "저장 중" : "저장"}
        </Button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-muted" : "text-orange-ink"}`}>
            {msg.text}
          </p>
        )}
      </form>
    </Card>
  );
}

/** 탈퇴. 실수를 막기 위해 한 번 더 확인한다. */
export function WithdrawSection() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3 px-5 py-5 sm:px-7">
      <span className="font-bold">탈퇴</span>
      <span className="text-[13px] text-muted">계정과 학습 기록, 빼기, 신고 내용이 모두 지워지고 되돌릴 수 없습니다.</span>
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-[14px] bg-orange-soft p-4">
          <p className="text-sm font-bold text-orange-ink">정말 탈퇴하시겠습니까? 학습 기록을 되살릴 수 없습니다.</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending} className="flex-1">
              취소
            </Button>
            <button
              type="button"
              onClick={() => start(() => withdraw())}
              disabled={pending}
              aria-busy={pending || undefined}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-[14px] bg-orange px-4 font-bold text-surface"
            >
              {pending && <Spinner />}
              탈퇴하기
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-orange-ink underline-offset-[3px] hover:underline">
            탈퇴하기
          </button>
        </div>
      )}
    </Card>
  );
}
