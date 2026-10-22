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
