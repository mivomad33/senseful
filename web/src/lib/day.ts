// 학습일 계산. 하루는 한국 시간(Asia/Seoul) 기준 dayStartHour시에 바뀐다. 서버 시간대와 상관없다.
// 한국은 서머타임이 없어 UTC+9로 고정해 계산한다.

export const TIME_ZONE = "Asia/Seoul";
const OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** now가 속한 학습일의 [시작, 끝). */
export function dayRange(now: Date, dayStartHour: number): { start: Date; end: Date } {
  // 한국 시간에서 dayStartHour만큼 뺀 날짜가 학습일이다.
  const shifted = new Date(now.getTime() + OFFSET_MS - dayStartHour * 3_600_000);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), dayStartHour) - OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** 학습일 키(YYYY-MM-DD, 한국 날짜). */
export function dayKey(now: Date, dayStartHour: number): string {
  const d = new Date(dayRange(now, dayStartHour).start.getTime() + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 학습일 시작에서 n일 뒤(음수면 앞) 시각 */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** 요일(예: "월"), 한국 시간 기준 */
export function weekday(d: Date): string {
  return d.toLocaleDateString("ko-KR", { weekday: "short", timeZone: TIME_ZONE });
}
