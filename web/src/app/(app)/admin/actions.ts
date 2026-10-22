"use server";

import { refresh } from "next/cache";
import { db } from "@/db";
import { actionAdmin } from "@/lib/auth/current";
import { resolveReport } from "@/lib/cards/edit";

/** 신고 처리 완료 표시(관리자만) */
export async function markResolved(reportId: number): Promise<void> {
  await actionAdmin();
  await resolveReport(db, reportId);
  refresh();
}
