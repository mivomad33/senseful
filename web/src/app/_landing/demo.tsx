"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { Badge, Card } from "@/components/ui";
import { DEMO, demoGrade } from "./content";

const field = "w-full rounded-[14px] border-2 border-transparent bg-subtle px-4 py-3.5 text-[17px] leading-relaxed outline-none focus:border-blue focus:bg-surface focus:shadow-[0_0_0_4px_rgb(29_78_216/0.15)] resize-none";

/** 체험 카드. 실제 학습 카드와 같은 모양이고, API 없이 미리 정한 규칙으로 판정한다. */
export function DemoCard() {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ ok: boolean; answer: string } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult({ ok: demoGrade(answer), answer: answer.trim() });
  };

  if (result) {
    const ok = result.ok;
    const [before, after] = DEMO.exampleEn.split("runs");
    return (
      <Card className="flex flex-col overflow-hidden p-0">
        <div className={`flex items-center justify-between gap-3 px-5 py-4 sm:px-7 ${ok ? "bg-blue-soft" : "bg-orange-soft"}`}>
          <span className="flex items-center gap-3">
            <span className={`flex size-9 items-center justify-center rounded-full text-surface ${ok ? "bg-blue" : "bg-orange"}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
              </svg>
            </span>
            <span className={`text-[22px] font-extrabold ${ok ? "text-blue-ink" : "text-orange-ink"}`}>{ok ? "맞음" : "틀림"}</span>
          </span>
          <span className={`text-sm ${ok ? "text-blue-ink" : "text-orange-ink"}`}>{ok ? "다음 복습 2일 뒤" : "10분 뒤에 다시 나옵니다"}</span>
        </div>
        <div className="flex flex-col gap-4 px-5 py-6 sm:px-7">
          <p lang="en" className="text-[21px] leading-snug font-bold">
            {before}
            <span className={`rounded px-0.5 ${ok ? "bg-blue-soft" : "bg-orange-mark"}`}>runs</span>
            {after}
          </p>
          <div className="flex flex-col gap-1 rounded-[14px] bg-subtle px-4 py-3">
            <small className="text-xs font-semibold text-muted">내 답안</small>
            <span className={ok ? "" : "text-muted line-through decoration-orange"}>{result.answer || "(비어 있음)"}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-[14px] bg-blue-soft px-4 py-3">
            <small className="text-xs font-semibold text-blue-ink">정답 번역</small>
            <b>{DEMO.exampleKo}</b>
          </div>
          <div>
            <b lang="en" className="font-extrabold">
              {DEMO.headword}
            </b>{" "}
            — {DEMO.senseKo}
          </div>
          <div className="text-[13px] text-muted">{ok ? DEMO.reasonOk : DEMO.reasonNg}</div>
          <Button variant="secondary" className="self-end px-[22px]" onClick={() => setResult(null)}>
            다시 해 보기
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <form onSubmit={submit} className="flex flex-col gap-[22px] px-5 py-6 sm:px-8 sm:pt-[30px] sm:pb-7">
        <div className="flex items-center justify-between gap-2">
          <span className="flex gap-2">
            <Badge tone="violet">새 카드</Badge>
            <Badge>B1</Badge>
          </span>
          <span className="text-xs text-hint">직접 해 보기</span>
        </div>
        <p lang="en" className="py-[18px] text-center text-[22px] leading-[1.35] font-bold tracking-tight sm:text-[26px]">
          {DEMO.exampleEn}
        </p>
        <label htmlFor="demo-answer" className="sr-only">
          번역
        </label>
        <textarea
          id="demo-answer"
          ref={ref}
          rows={2}
          maxLength={300}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="문장 전체를 한국어로 번역"
          className={field}
        />
        <div className="flex flex-wrap gap-2">
          {DEMO.samples.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setAnswer(s);
                ref.current?.focus();
              }}
              className="rounded-full border border-edge bg-surface px-3 py-1.5 text-[13px] text-muted hover:border-faint hover:text-ink"
            >
              예시 답 {i === 0 ? "①" : "②"}
            </button>
          ))}
        </div>
        <Button type="submit">제출</Button>
      </form>
    </Card>
  );
}
