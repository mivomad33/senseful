import type { ComponentProps } from "react";

/** primary: 주된 행동, secondary: 흰 바탕의 보조 행동, soft: 카드 안의 작은 보조 행동, text: 링크처럼 보이는 작은 행동 */
export type ButtonVariant = "primary" | "secondary" | "soft" | "text";

const solid = "rounded-[14px] px-4 text-center font-bold";
const variants: Record<ButtonVariant, string> = {
  primary: `${solid} h-14 bg-strong text-[17px] text-on-strong`,
  secondary: `${solid} h-14 border border-edge bg-surface`,
  soft: "h-11 rounded-xl bg-page px-[18px] font-bold",
  text: "text-sm font-medium text-link underline-offset-[3px] hover:underline",
};

/** 버튼 모양 클래스. 링크(<Link>)를 버튼처럼 보이게 할 때도 쓴다. 커서는 globals.css에서 정한다. */
export function buttonStyles(variant: ButtonVariant = "primary", className?: string): string {
  const base = variant === "text" ? variants.text : `inline-flex items-center justify-center gap-2 ${variants[variant]}`;
  return className ? `${base} ${className}` : base;
}

/** 도는 원. 기다리는 동안 멈춘 것처럼 보이지 않게 한다. 색은 글자색을 따른다. */
export function Spinner({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 앱 공통 버튼. type 기본값은 폼을 실수로 제출하지 않게 "button"이다.
 * loading: 누를 수 없게 하고 스피너를 앞에 붙인다. 흐리게 하지 않아 진행 중인 행동으로 보인다.
 */
export function Button({
  variant = "primary",
  className,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; loading?: boolean }) {
  const state = loading ? "" : "disabled:opacity-50";
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonStyles(variant, className ? `${state} ${className}` : state)} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}
