import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Card, Loading } from "@/components/ui";
import { config } from "@/config";
import { requireUser } from "@/lib/auth/current";
import { FEEDBACK_MAILTO } from "@/lib/links";
import { SettingsForm, WithdrawSection } from "./settings-form";

export const metadata: Metadata = { title: "설정 - Senseful" };

async function Content() {
  const u = await requireUser();
  return (
    <>
      <SettingsForm initial={{ newPerDay: u.newPerDay, excludedLevels: u.excludedLevels }} min={config.newPerDayMin} max={config.newPerDayMax} />
      <Card className="flex flex-col gap-2 px-5 py-5 text-sm sm:px-7">
        <span className="font-bold">계정</span>
        <span className="text-muted">{u.email}</span>
      </Card>
      <WithdrawSection />
    </>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-4 px-4 py-8 sm:py-10">
      <header className="flex items-center gap-4 px-1 pb-2">
        <Link href="/home" aria-label="홈으로" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">설정</h1>
      </header>
      <Suspense fallback={<Loading card />}>
        <Content />
      </Suspense>
      <p className="px-1 text-center text-sm text-muted">
        써 보니 어떠셨나요?{" "}
        <a href={FEEDBACK_MAILTO} className="text-link underline-offset-[3px] hover:underline">
          개발자에게 의견 보내기
        </a>
      </p>
    </main>
  );
}
