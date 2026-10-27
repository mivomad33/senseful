// 화면에 보일 시간 표시. 홈(서버)과 학습 화면(클라이언트)이 같이 쓴다. 시각은 한국 시간으로 보인다.
import { TIME_ZONE } from "./day";

/** 남은 시간(예: "10분 뒤", "3일 뒤") */
export function after(due: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((due - now) / 60_000));
  if (min < 60) return `${min}분 뒤`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간 뒤`;
  return `${Math.round(h / 24)}일 뒤`;
}

/** 판정 결과의 다음 복습 문구. 지난 결과를 나중에 다시 보면 시각이 이미 지났을 수 있어, 그때는 "0분 뒤" 대신 지금 볼 수 있다고 보인다. */
export function dueText(due: number, isCorrect: boolean, now = Date.now()): string {
  if (Math.round((due - now) / 60_000) <= 0) return isCorrect ? "지금 복습할 수 있습니다" : "지금 다시 볼 수 있습니다";
  return isCorrect ? `다음 복습 ${after(due, now)}` : `${after(due, now)} 다시 나옵니다`;
}

/** 시각(예: "오후 05:01") */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
}

/** 다시 볼 카드 대기 문구(예: "다시 볼 카드가 3분 뒤에 나옵니다(오후 05:01).") */
export function waitingText(until: number): string {
  return `다시 볼 카드가 ${after(until)}에 나옵니다(${clock(until)}).`;
}
