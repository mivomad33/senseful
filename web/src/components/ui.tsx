import type { ComponentProps, ReactNode } from "react";

/** 회색 바탕 위의 흰 카드. 화면의 묶음 하나를 담는다. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={`rounded-[20px] bg-surface shadow-card ${className ?? "p-7"}`} {...props} />;
}

/** 카드 제목 */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-base font-bold">{children}</h2>
      {aside && <span className="text-[13px] text-muted">{aside}</span>}
    </div>
  );
}

/** 키보드 키 모양(예: Enter) */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-b-2 border-key-edge px-[7px] font-sans text-[11px] font-semibold text-hint">
      {children}
    </kbd>
  );
}

/** 작은 꼬리표(예: 새 카드, A1) */
export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "violet" | "blue" }) {
  const tones = { plain: "bg-page text-muted", violet: "bg-violet-soft text-violet-ink", blue: "bg-blue-soft text-blue-ink" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

/** 로고. "ful"을 보라로 강조한다(파비콘의 보라 점과 같은 색). */
export function Logo({ className = "text-xl" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      Sense<span className="text-violet">ful</span>
    </span>
  );
}

/** 불러오는 동안의 표시. DB가 쉬다가 깨어나는 동안에도 멈춘 것처럼 보이지 않게 한다. card면 카드 모양으로 보인다. */
export function Loading({ card = false }: { card?: boolean }) {
  const body = (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[18px] animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      불러오는 중입니다
    </span>
  );
  return card ? <Card className="flex min-h-40 items-center justify-center p-7">{body}</Card> : <div className="flex justify-center py-6">{body}</div>;
}
