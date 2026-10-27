"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/button";
import { GradeLimitNotice, NoNewCardsNotice } from "@/components/notices";
import { Badge, Card, Kbd } from "@/components/ui";
import { dueText, waitingText } from "@/lib/format";
import { findHeadword } from "@/lib/highlight";
import { FEEDBACK_MAILTO } from "@/lib/links";
import {
  correctGrade,
  editCard,
  getNext,
  hideCard,
  removeCard,
  sendReport,
  studyMoreNew,
  submitAnswer,
  unhideCard,
  unremoveCard,
  type Counts,
  type Graded,
  type StudyView,
} from "./actions";
import { applyCardEdit, isSuperseded, markReported, needsReload, patchAt, type Entry } from "./history";

/** 입력 길이 상한(서버도 같은 값으로 거부한다) */
const ANSWER_MAX = 300;
const REPORT_MAX = 500;

/** 홈으로 가는 버튼, 오늘 진행 막대, "답한 수 / 답한 수 + 남은 수" */
function Progress({ counts }: { counts: Counts }) {
  const total = counts.done + counts.review + counts.new + counts.learning;
  const ratio = total ? counts.done / total : 1;
  return (
    <header className="flex items-center gap-4 text-sm">
      <Link href="/home" aria-label="홈으로" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <div className="h-2 flex-1 rounded-full bg-edge">
        <div className="h-2 rounded-full bg-strong transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="font-bold tabular-nums" title="오늘 답한 수 / 답한 수 + 남은 카드">
        {counts.done} / {total}
      </span>
    </header>
  );
}

const KIND_LABEL = { new: "새 카드", review: "복습", learning: "다시 볼 카드" } as const;

/** 예문. 판정 후에는 표제어를 찾으면 강조한다. */
function Sentence({ text, headword, mark, className }: { text: string; headword?: string; mark?: string; className: string }) {
  const at = headword ? findHeadword(text, headword) : null;
  return (
    <p lang="en" className={className}>
      {at ? (
        <>
          {text.slice(0, at[0])}
          <span className={`rounded-md px-1 ${mark}`}>{text.slice(at[0], at[1])}</span>
          {text.slice(at[1])}
        </>
      ) : (
        text
      )}
    </p>
  );
}

const field = "rounded-[14px] border-2 border-transparent bg-subtle px-4 py-3.5 text-[17px] leading-relaxed outline-none focus:border-blue focus:bg-surface focus:shadow-[0_0_0_4px_rgb(29_78_216/0.15)]";

/** 카드 수정 폼(관리자, 개요 문서 5.5). 저장하면 고친 내용을 돌려준다. */
function EditCardForm({ graded, onSaved, onCancel }: { graded: Graded; onSaved: (g: Graded) => void; onCancel: () => void }) {
  const [senseKo, setSenseKo] = useState(graded.senseKo);
  const [exampleEn, setExampleEn] = useState(graded.exampleEn);
  const [exampleKo, setExampleKo] = useState(graded.exampleKo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await editCard(graded.cardId, { senseKo, exampleEn, exampleKo });
      if (r.ok) onSaved({ ...graded, ...r.content });
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">
          뜻 (<span lang="en">{graded.headword}</span>)
        </span>
        <input value={senseKo} onChange={(e) => setSenseKo(e.target.value)} disabled={pending} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">예문</span>
        <textarea lang="en" value={exampleEn} onChange={(e) => setExampleEn(e.target.value)} rows={2} disabled={pending} className={`${field} resize-none`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">예문 번역</span>
        <textarea value={exampleKo} onChange={(e) => setExampleKo(e.target.value)} rows={2} disabled={pending} className={`${field} resize-none`} />
      </label>
      {error && (
        <p role="alert" className="text-orange-ink">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={pending} className="flex-1">
          취소
        </Button>
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? "저장 중" : "저장"}
        </Button>
      </div>
    </form>
  );
}

/** 오류 신고 폼(일반 사용자). 설명은 선택이다. */
function ReportForm({ cardId, onDone, onCancel }: { cardId: number; onDone: () => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await sendReport(cardId, note);
      if (r.ok) onDone();
      else setError(r.error);
    });
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">어떤 점이 틀렸습니까? (선택, {REPORT_MAX}자까지)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={REPORT_MAX} rows={3} disabled={pending} className={`${field} resize-none text-base`} />
      </label>
      {error && (
        <p role="alert" className="text-orange-ink">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={pending} className="flex-1">
          취소
        </Button>
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? "보내는 중" : "신고 보내기"}
        </Button>
      </div>
    </form>
  );
}

/** 오늘 학습 완료 뒤 새 카드를 더 학습하는 버튼. 더할 수 없으면 이유를 알린다(개요 문서 5.3). */
function MoreNew({ counts, onStudy, pending }: { counts: Counts; onStudy: () => void; pending: boolean }) {
  if (counts.moreNew > 0) {
    return (
      <Button onClick={onStudy} loading={pending}>
        새 카드 {counts.moreNew}장 더 학습
      </Button>
    );
  }
  if (counts.newTotal === 0) return null; // 새 카드 소진 안내가 따로 보인다
  return <p className="text-muted">{counts.restNew > 0 ? "남은 새 카드는 오늘 학습한 단어의 다른 뜻이라 내일 나옵니다." : "오늘은 더 학습할 새 카드가 없습니다."}</p>;
}

/** 판정 결과 맨 위 띠: 맞음은 파랑, 틀림은 주황 */
function Verdict({ graded }: { graded: Graded }) {
  const ok = graded.isCorrect;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 sm:px-8 sm:py-5 ${ok ? "bg-blue-soft" : "bg-orange-soft"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-full text-surface ${ok ? "bg-blue" : "bg-orange"}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
        </span>
        <span className={`text-2xl font-extrabold ${ok ? "text-blue-ink" : "text-orange-ink"}`}>{ok ? "맞음" : "틀림"}</span>
        {graded.isCorrect !== graded.graderIsCorrect && <span className="text-sm text-muted">(정정함)</span>}
      </div>
      <span className={`text-sm ${ok ? "text-blue-ink" : "text-orange-ink"}`}>{dueText(graded.due, ok)}</span>
    </div>
  );
}

type Limit = Extract<Awaited<ReturnType<typeof submitAnswer>>, { limit: unknown }>;

/** 지난 결과로 가는 링크. 결과가 없으면 보이지 않는다. */
function PastLink({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <Button variant="text" onClick={onOpen}>
      ← 지난 결과 보기
    </Button>
  );
}

/** 결과가 아닌 화면 아래 줄: 왼쪽에 지난 결과 링크, 오른쪽에 단축키 안내(터치 기기에서는 숨긴다) */
function BottomRow({ count, onOpen, children }: { count: number; onOpen: () => void; children?: React.ReactNode }) {
  if (count === 0 && !children) return null;
  return (
    <div className="-mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
      <PastLink count={count} onOpen={onOpen} />
      <div className="ml-auto flex items-center gap-4 text-xs text-hint pointer-coarse:hidden">
        {children}
        {count > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Esc</Kbd>지난 결과
          </span>
        )}
      </div>
    </div>
  );
}

const chevron = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const navButton = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface disabled:opacity-40";

/**
 * initialAhead: 홈의 "기다리지 않고 바로 보기"로 들어왔는지. 켜지면 이 화면에 있는 동안 계속 앞당긴다.
 * isAdmin: 관리자는 판정 후 화면에서 공용 카드를 고치거나 뺀다. 일반 사용자는 오류 신고와 나만 빼기를 한다.
 */
export function StudySession({ initial, initialAhead = false, isAdmin }: { initial: StudyView; initialAhead?: boolean; isAdmin: boolean }) {
  // view는 맨 앞(지금 풀 차례인 문제, 또는 완료·대기 화면)이다.
  const [view, setView] = useState(initial);
  const [ahead, setAhead] = useState(initialAhead);
  // 이번 학습의 판정 결과(화면 상태에만 둔다). viewing은 보고 있는 결과의 위치이고, null이면 맨 앞을 본다.
  const [history, setHistory] = useState<Entry[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  // 맨 앞 카드에 답했는지(최근 결과를 아직 넘기지 않았는지). 그러면 다음 문제 풀기가 다음 카드를 불러온다.
  const [answered, setAnswered] = useState(false);
  // 맨 앞을 불러온 뒤 지난 결과에서 정정하거나 빼서 서버의 대기열이 바뀐 카드
  const [changed, setChanged] = useState<ReadonlySet<number>>(new Set());
  // 뺀 카드. 서버에서 카드 단위라 같은 카드의 모든 결과에 보인다.
  const [excludedCards, setExcludedCards] = useState<ReadonlySet<number>>(new Set());
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<Limit | null>(null);
  const [panel, setPanel] = useState<"edit" | "report" | null>(null);
  // 방금 낸 카드가 오늘 대기열 밖이어서 판정하지 않고 넘어갔는지(새벽 4시를 넘겨 띄워 둔 카드 등). 다음 제출 때 지운다.
  const [skipped, setSkipped] = useState(false);
  const [correctError, setCorrectError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nextRef = useRef<HTMLButtonElement>(null);

  const loadNext = (aheadNow = ahead) =>
    start(async () => {
      setViewing(null);
      setAnswered(false);
      setChanged(new Set());
      setPanel(null);
      setAnswer("");
      setError(null);
      setCorrectError(null);
      setView(await getNext(aheadNow));
    });

  /** i번째 결과를 연다. */
  const open = (i: number) => {
    setViewing(i);
    setPanel(null);
    setCorrectError(null);
  };
  const openLatest = () => open(history.length - 1);

  /** 다음 문제 풀기: 맨 앞으로 간다. 다시 불러올 필요가 없으면 풀던 문제(쓰던 답안 그대로)로 돌아간다. */
  const willLoad = needsReload(view, answered, changed);
  const goFront = () => {
    if (willLoad) loadNext();
    else {
      setViewing(null);
      setPanel(null);
      setCorrectError(null);
    }
  };

  const goAhead = () => {
    setAhead(true);
    loadNext(true);
  };

  const studyMore = () =>
    start(async () => {
      await studyMoreNew();
      setView(await getNext(ahead));
    });

  // 남은 카드가 다시 나올 시각을 기다리는 중이면 그 시각에 다시 불러온다. 지난 결과를 보는 동안에는 미루고, 돌아오면 확인한다.
  // 기기가 잠자기에서 깨어나 시각을 놓쳤을 때를 위해 화면이 다시 보일 때도 확인한다.
  const reload = useEffectEvent(() => loadNext());
  useEffect(() => {
    if (view.status !== "waiting" || viewing !== null) return;
    const t = setTimeout(reload, Math.max(1000, view.until - Date.now() + 500));
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= view.until) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, viewing]);

  // 판정 결과 화면: Enter로 다음 문제 풀기(버튼에 포커스가 있으면 그 버튼이 처리한다), ←/→로 이전·다음 결과.
  // 카드를 고치거나 신고하는 중에는 쓰지 않는다.
  const step = useEffectEvent((d: -1 | 1) => {
    if (viewing === null) return;
    const i = viewing + d;
    if (i >= 0 && i < history.length) open(i);
  });
  useEffect(() => {
    if (viewing === null || panel) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) nextRef.current?.click();
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, panel]);

  // 결과가 아닌 화면: Esc로 최근 결과. 입력란에 포커스가 있어도 되고, 한글 조합을 끝내는 Esc와 판정 중에는 움직이지 않는다.
  const toLatest = useEffectEvent(() => openLatest());
  useEffect(() => {
    if (viewing !== null || history.length === 0 || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        toLatest();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, history.length, pending]);

  const noNew = view.counts.newTotal === 0 && <NoNewCardsNotice />;
  const skippedNotice = skipped && (
    <p role="status" className="px-1 text-sm text-muted">
      방금 카드는 지금 학습할 카드가 아니어서 판정하지 않고 넘어갔습니다.
    </p>
  );

  if (viewing !== null) {
    const i = viewing;
    const entry = history[i];
    const graded = entry.graded;
    const ok = graded.isCorrect;
    const excluded = excludedCards.has(graded.cardId);
    const superseded = isSuperseded(history, i);
    const nextLabel = willLoad ? "다음 카드" : view.status === "card" ? "풀던 문제로" : "돌아가기";

    const correct = () =>
      start(async () => {
        setCorrectError(null);
        const r = await correctGrade(graded.logId, !graded.isCorrect);
        if (r.ok) {
          setHistory((h) => patchAt(h, i, { isCorrect: r.isCorrect, due: r.due }));
          setChanged((c) => new Set(c).add(graded.cardId));
        } else setCorrectError(r.error);
      });

    const setExcluded = (on: boolean) => {
      setExcludedCards((s) => {
        const next = new Set(s);
        if (on) next.add(graded.cardId);
        else next.delete(graded.cardId);
        return next;
      });
      setChanged((c) => new Set(c).add(graded.cardId));
    };

    const exclude = () => {
      const ask = isAdmin ? "이 카드를 모든 사용자에게서 빼시겠습니까? 다시 만들어지지도 않습니다." : "이 카드를 빼시겠습니까? 나에게만 다시 나오지 않습니다.";
      if (!window.confirm(ask)) return;
      start(async () => {
        await (isAdmin ? removeCard : hideCard)(graded.cardId);
        setExcluded(true);
      });
    };

    const restore = () =>
      start(async () => {
        await (isAdmin ? unremoveCard : unhideCard)(graded.cardId);
        setExcluded(false);
      });

    return (
      <>
        <Progress counts={view.counts} />
        <nav aria-label="판정 결과 이동" className="-mb-1 flex items-center justify-between gap-3">
          <button type="button" aria-label="이전 결과" onClick={() => open(i - 1)} disabled={i === 0} className={navButton}>
            {chevron("M15 6l-6 6 6 6")}
          </button>
          <span className="text-sm font-semibold text-muted tabular-nums">
            결과 {i + 1} / {history.length}
          </span>
          <button type="button" aria-label="다음 결과" onClick={() => open(i + 1)} disabled={i === history.length - 1} className={navButton}>
            {chevron("M9 6l6 6-6 6")}
          </button>
        </nav>
        <Card className="flex flex-col overflow-hidden">
          <Verdict graded={graded} />
          <div className="flex flex-col gap-5 px-5 py-6 sm:px-8 sm:py-7">
            <Sentence text={graded.exampleEn} headword={graded.headword} mark={ok ? "bg-blue-soft" : "bg-orange-mark"} className="text-[20px] leading-snug font-bold sm:text-[22px]" />
            {panel === "edit" ? (
              <EditCardForm
                graded={graded}
                onSaved={(g) => {
                  setHistory((h) => applyCardEdit(h, g));
                  setPanel(null);
                }}
                onCancel={() => setPanel(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1 rounded-[14px] bg-subtle px-4 py-3.5">
                    <span className="text-xs font-semibold text-muted">내 답안</span>
                    <span className={ok ? "" : "text-muted line-through decoration-orange"}>{graded.answer || "(비어 있음)"}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-[14px] bg-blue-soft px-4 py-3.5">
                    <span className="text-xs font-semibold text-blue-ink">정답 번역</span>
                    <span className="font-bold">{graded.exampleKo}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 leading-relaxed">
                  <span>
                    <span lang="en" className="font-extrabold">
                      {graded.headword}
                    </span>{" "}
                    — {graded.senseKo}
                  </span>
                  <span className="text-[13px] text-muted">{graded.reason}</span>
                </div>
                {panel === "report" ? (
                  <ReportForm
                    cardId={graded.cardId}
                    onDone={() => {
                      setPanel(null);
                      setHistory((h) => markReported(h, i));
                    }}
                    onCancel={() => setPanel(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                    {excluded ? (
                      <p className="text-sm text-muted">
                        {isAdmin ? "이 카드를 모두에게서 뺐습니다." : "이 카드를 뺐습니다. 다시 나오지 않습니다."}{" "}
                        <Button variant="text" onClick={restore} disabled={pending}>
                          빼기 취소
                        </Button>
                      </p>
                    ) : (
                      <>
                        {entry.reported && <span className="text-sm text-muted">신고를 보냈습니다. 고맙습니다.</span>}
                        {isAdmin ? (
                          <Button variant="text" onClick={() => setPanel("edit")} disabled={pending}>
                            카드 수정
                          </Button>
                        ) : (
                          !entry.reported && (
                            <Button variant="text" onClick={() => setPanel("report")} disabled={pending}>
                              오류 신고
                            </Button>
                          )
                        )}
                        <Button variant="text" onClick={exclude} disabled={pending}>
                          {isAdmin ? "카드 빼기" : "나만 빼기"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
        {correctError && (
          <p role="alert" className="px-1 text-sm text-orange-ink">
            {correctError}
          </p>
        )}
        {!panel && (
          <>
            <div className="flex items-center gap-3">
              {!excluded &&
                (superseded ? (
                  <p className="flex-1 px-1 text-sm text-muted">이후에 다시 풀어 이 결과는 정정할 수 없습니다.</p>
                ) : (
                  <Button variant="secondary" onClick={correct} disabled={pending} className="flex-1 border-0 text-[15px] whitespace-nowrap sm:text-base">
                    {ok ? "틀림으로 정정" : "맞음으로 정정"}
                  </Button>
                ))}
              <Button ref={nextRef} onClick={goFront} disabled={pending} className="flex-[1.3] sm:flex-[2]">
                {nextLabel}
              </Button>
            </div>
            <div className="-mt-1.5 flex items-center justify-end gap-4 pr-1 text-xs text-hint pointer-coarse:hidden">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd>이동
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Enter</Kbd>
                {nextLabel}
              </span>
            </div>
          </>
        )}
      </>
    );
  }

  if (view.status === "done") {
    return (
      <>
        <Progress counts={view.counts} />
        {skippedNotice}
        <Card className="flex flex-col gap-5 p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold">오늘 학습 완료</h1>
          <p className="-mt-2 text-sm text-muted">
            써 보니 어떠셨나요?{" "}
            <a href={FEEDBACK_MAILTO} className="text-link underline-offset-[3px] hover:underline">
              개발자에게 의견 보내기
            </a>
          </p>
          <MoreNew counts={view.counts} onStudy={studyMore} pending={pending} />
          {noNew}
          <Link href="/home" className={buttonStyles("secondary")}>
            홈으로
          </Link>
        </Card>
        <BottomRow count={history.length} onOpen={openLatest} />
      </>
    );
  }

  if (view.status === "waiting") {
    return (
      <>
        <Progress counts={view.counts} />
        {skippedNotice}
        <Card className="flex flex-col gap-5 p-6 sm:p-8">
          <p className="text-lg font-bold">{waitingText(view.until)}</p>
          <p className="text-muted">이 화면을 열어 두면 그때 이어서 나옵니다.</p>
          <Button onClick={goAhead} loading={pending}>
            기다리지 않고 바로 보기
          </Button>
          {noNew}
        </Card>
        <BottomRow count={history.length} onOpen={openLatest} />
      </>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // 판정 중에는 입력란을 읽기 전용으로만 두므로 Enter로 다시 제출되지 않게 막는다.
    if (pending) return;
    const at = history.length;
    start(async () => {
      setError(null);
      setLimit(null);
      setSkipped(false);
      const r = await submitAnswer(view.cardId, answer);
      if (r.ok) {
        setHistory((h) => [...h, { graded: r.graded, reported: false }]);
        setViewing(at);
        setAnswered(true);
        setPanel(null);
        setCorrectError(null);
      } else if ("outside" in r) {
        setSkipped(true);
        loadNext();
      } else if ("limit" in r) setLimit(r);
      else setError(r.error);
    });
  };

  return (
    <>
      <Progress counts={view.counts} />
      {skippedNotice}
      <Card className="flex min-h-[380px] flex-col gap-6 p-5 sm:min-h-[460px] sm:p-9">
        <div className="flex gap-2">
          <Badge tone={view.kind === "new" ? "violet" : view.kind === "review" ? "blue" : "plain"}>{KIND_LABEL[view.kind]}</Badge>
          <Badge>{view.level.toUpperCase()}</Badge>
        </div>
        <Sentence text={view.exampleEn} className="flex flex-1 items-center justify-center text-center text-[24px] leading-snug font-bold tracking-tight sm:text-[30px]" />
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label htmlFor="answer" className="sr-only">
            번역
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            autoFocus
            rows={2}
            maxLength={ANSWER_MAX}
            enterKeyHint="send"
            // 판정 중에도 흐리게 하지 않고 포커스를 유지한다(실패하면 바로 고쳐 다시 제출할 수 있게).
            readOnly={pending}
            placeholder="문장 전체를 한국어로 번역"
            className={`${field} resize-none`}
          />
          <Button type="submit" loading={pending}>
            {pending ? "판정 중" : "제출"}
          </Button>
          {error && (
            <p role="alert" className="text-orange-ink">
              {error} 다시 제출할 수 있습니다.
            </p>
          )}
          {limit && <GradeLimitNotice scope={limit.limit} perUser={limit.perUser} dayStartHour={limit.dayStartHour} />}
        </form>
      </Card>
      {noNew}
      <BottomRow count={history.length} onOpen={openLatest}>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Enter</Kbd>제출
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Shift</Kbd>
          <span className="text-faint">+</span>
          <Kbd>Enter</Kbd>줄바꿈
        </span>
      </BottomRow>
    </>
  );
}
