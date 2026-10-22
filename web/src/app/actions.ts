"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { config } from "@/config";
import { db } from "@/db";
import { claudeGenerate } from "@/lib/card-gen/claude";
import { createCards, type CreateResult } from "@/lib/card-gen/create";
import { addExtraNew } from "@/lib/study/schedule";

export type NewCardsState = (CreateResult & { error?: string }) | null;

export async function makeNewCards(): Promise<NewCardsState> {
  if (!process.env.ANTHROPIC_API_KEY) return { created: 0, failed: [], error: "ANTHROPIC_API_KEY가 없다(web/.env.local)" };
  const result = await createCards(db, claudeGenerate, config.newPerDay);
  for (const f of result.failed) console.error(`[카드 생성] 실패 ${f.headword}: ${f.reason}`);
  refresh();
  return result;
}

/** 홈의 "새 카드 N장 더 학습": 오늘 새 카드 상한을 늘리고 학습 화면으로 간다. */
export async function studyMoreNewFromHome(): Promise<void> {
  addExtraNew(db);
  redirect("/study");
}
