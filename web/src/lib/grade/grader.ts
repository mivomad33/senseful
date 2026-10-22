// 앱이 쓰는 판정 함수. E2E 테스트는 개발 서버에서 SENSEFUL_FAKE_GRADER=1로 가짜 판정을 써 API 비용을 쓰지 않는다.
// 가짜 판정은 개발 서버(next dev)에서만 켜진다. 답에 "틀림"이 들어 있으면 틀림, 아니면 맞음이다.
import { isDev } from "@/config";
import { claudeGrade, type Grader } from "./claude";

const fakeGrade: Grader = async (input) =>
  input.answer.includes("틀림") ? { is_correct: false, reason: "가짜 판정: 틀림입니다." } : { is_correct: true, reason: "가짜 판정: 맞음입니다." };

export function appGrader(): Grader | null {
  if (isDev && process.env.SENSEFUL_FAKE_GRADER === "1") return fakeGrade;
  return process.env.ANTHROPIC_API_KEY ? claudeGrade : null;
}
