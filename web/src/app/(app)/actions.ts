"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { actionUser, studyUser } from "@/lib/auth/current";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";
import { deleteAccount, saveSettings, type SettingsResult } from "@/lib/settings";
import { addExtraNew } from "@/lib/study/schedule";

/** 홈의 "새 카드 N장 더 학습": 오늘 새 카드 상한을 늘리고 학습 화면으로 간다. */
export async function studyMoreNewFromHome(): Promise<void> {
  const u = await actionUser();
  await addExtraNew(db, studyUser(u));
  redirect("/study");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(db, token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

export async function updateSettings(input: { newPerDay: number; excludedLevels: string[] }): Promise<SettingsResult> {
  const u = await actionUser();
  return saveSettings(db, u.id, input);
}

/** 탈퇴. 화면에서 한 번 더 확인한 뒤 부른다. */
export async function withdraw(): Promise<void> {
  const u = await actionUser();
  await deleteAccount(db, u.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
