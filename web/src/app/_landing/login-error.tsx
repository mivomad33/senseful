"use client";

import { useSearchParams } from "next/navigation";

/** 로그인이 실패해 돌아왔을 때(?error=login) 알린다. */
export function LoginError() {
  if (useSearchParams().get("error") !== "login") return null;
  return (
    <p role="alert" className="rounded-[14px] bg-orange-soft px-4 py-3 text-sm text-orange-ink">
      로그인하지 못했습니다. 다시 시도해 주세요.
    </p>
  );
}
