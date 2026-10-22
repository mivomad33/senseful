// 사용자 설정(문서 4.2-6): 하루 새 카드 수와 레벨 제외. 바꾸면 그날 오늘의 학습에 바로 반영된다.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { LEVELS, type Level } from "@/lib/study/schedule";

export interface Settings {
  newPerDay: number;
  excludedLevels: Level[];
}

const SettingsSchema = z.object({
  newPerDay: z.number().int().min(config.newPerDayMin).max(config.newPerDayMax),
  excludedLevels: z
    .array(z.enum(LEVELS))
    .refine((l) => new Set(l).size < LEVELS.length, { message: "all" })
    .transform((l) => LEVELS.filter((x) => l.includes(x))),
});

export type SettingsResult = { ok: true; settings: Settings } | { ok: false; error: string };

/** 입력을 확인한다. 하루 새 카드 수는 1~20장, 레벨은 하나 이상 남겨야 한다. */
export function parseSettings(input: unknown): SettingsResult {
  const r = SettingsSchema.safeParse(input);
  if (r.success) return { ok: true, settings: r.data };
  if (r.error.issues.some((i) => i.message === "all")) return { ok: false, error: "레벨을 모두 제외할 수는 없습니다. 하나 이상 남겨 주세요." };
  return { ok: false, error: `하루 새 카드 수는 ${config.newPerDayMin}~${config.newPerDayMax}장 사이로 정할 수 있습니다.` };
}

export async function saveSettings(db: Db, userId: number, input: unknown): Promise<SettingsResult> {
  const r = parseSettings(input);
  if (!r.ok) return r;
  await db.update(users).set(r.settings).where(eq(users.id, userId));
  return r;
}

/** 탈퇴(문서 4.1-6). 계정과 그 사용자의 학습 데이터(카드 상태, 학습 기록, 빼기, 신고, 판정 사용 기록, 세션)를 모두 지운다. */
export async function deleteAccount(db: Db, userId: number): Promise<void> {
  await db.delete(users).where(eq(users.id, userId)); // 사용자 데이터는 외래 키 cascade로 함께 지워진다
}
