"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import type { ReportRow } from "@/lib/admin";
import { clock } from "@/lib/format";
import { editCard, removeCard, unremoveCard } from "../study/actions";
import { markResolved } from "./actions";

const field = "rounded-xl border-2 border-transparent bg-subtle px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-blue focus:bg-surface";

/** 신고 한 건: 카드 내용, 신고 내용, 신고자, 날짜, 처리 상태. 카드 수정·빼기와 처리 완료 표시 */
export function ReportItem({ report }: { report: ReportRow }) {
  const [card, setCard] = useState(report.card);
  const [editing, setEditing] = useState(false);
  const [resolved, setResolved] = useState(report.resolvedAt !== null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ senseKo: card.senseKo, exampleEn: card.exampleEn, exampleKo: card.exampleKo });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await editCard(card.id, form);
      if (r.ok) {
        setCard({ ...card, ...r.content });
        setEditing(false);
        setError(null);
      } else setError(r.error);
    });
  };
  const toggleExclude = () => {
    if (!card.excluded && !window.confirm("이 카드를 모든 사용자에게서 빼시겠습니까?")) return;
    start(async () => {
      await (card.excluded ? unremoveCard : removeCard)(card.id);
      setCard({ ...card, excluded: !card.excluded });
    });
  };
  const resolve = () =>
    start(async () => {
      await markResolved(report.id);
      setResolved(true);
    });

  const date = new Date(report.createdAt);
  return (
    <article className={`flex flex-col gap-3 border-t border-line pt-4 ${resolved ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate">
          {report.reporter} · {date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} {clock(date.getTime())}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 font-bold ${resolved ? "bg-page" : "bg-orange-soft text-orange-ink"}`}>{resolved ? "처리 완료" : "처리 안 함"}</span>
      </div>
      <p className="text-sm">{report.note ?? <span className="text-muted">(설명 없음)</span>}</p>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            뜻 ({card.headword})
            <input value={form.senseKo} onChange={(e) => setForm({ ...form, senseKo: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            예문
            <textarea lang="en" rows={2} value={form.exampleEn} onChange={(e) => setForm({ ...form, exampleEn: e.target.value })} className={`${field} resize-none`} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            예문 번역
            <textarea rows={2} value={form.exampleKo} onChange={(e) => setForm({ ...form, exampleKo: e.target.value })} className={`${field} resize-none`} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-orange-ink">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={pending} className="flex-1">
              취소
            </Button>
            <Button type="submit" loading={pending} className="flex-1">
              저장
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1 rounded-[14px] bg-subtle px-4 py-3 text-sm">
          <span>
            <span className="mr-1.5 rounded-full bg-page px-2 py-0.5 text-xs font-bold">{card.level.toUpperCase()}</span>
            <b lang="en">{card.headword}</b> — {card.senseKo}
            {card.excluded && <span className="ml-2 text-xs text-orange-ink">(뺀 카드)</span>}
          </span>
          <span lang="en">{card.exampleEn}</span>
          <span className="text-muted">{card.exampleKo}</span>
        </div>
      )}
      {!editing && (
        <div className="flex flex-wrap justify-end gap-x-5 gap-y-1">
          <Button variant="text" onClick={() => setEditing(true)} disabled={pending}>
            카드 수정
          </Button>
          <Button variant="text" onClick={toggleExclude} disabled={pending}>
            {card.excluded ? "빼기 취소" : "카드 빼기"}
          </Button>
          {!resolved && (
            <Button variant="text" onClick={resolve} disabled={pending}>
              처리 완료
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
