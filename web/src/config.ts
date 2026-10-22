// 앱 설정. 값은 환경 변수로 바꾸고, 없으면 아래 기본값을 쓴다. 비밀이 아닌 설정은 기본값으로 둔다.

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name}=${v}: 숫자가 아닙니다`);
  return n;
}

/** 개발 서버(next dev)인지 */
export const isDev = process.env.NODE_ENV === "development";

/** 운영 주소. 링크 미리보기·canonical·sitemap의 절대 주소 기준이다. */
export const SITE_URL = "https://senseful.vercel.app";
/** 개발자 연락처(의견 보내기, 개인정보 처리방침, 한도 안내) */
export const CONTACT_EMAIL = "mivomad33@gmail.com";
export const REPO_URL = "https://github.com/mivomad33/senseful";

export const config = {
  /** 하루 새 카드 수 설정의 기본값과 범위(사용자 설정) */
  newPerDayDefault: 10,
  newPerDayMin: 1,
  newPerDayMax: 20,
  /** "새 카드 더 학습" 한 번에 더하는 장수. 하루 새 카드 상한을 다 쓴 뒤 원할 때만 더한다. */
  extraNewStep: num("SENSEFUL_EXTRA_NEW_STEP", 10),
  /** 하루 복습 상한 */
  reviewsPerDay: num("SENSEFUL_REVIEWS_PER_DAY", 200),
  /** 하루가 바뀌는 시각(한국 시간, 0~23). Anki 기본값과 같이 새벽 4시다. */
  dayStartHour: num("SENSEFUL_DAY_START_HOUR", 4),
  /** 하루 판정(API) 한도. 사용자별, 전체. 관리자는 두 한도에서 빠진다. */
  gradeLimitPerUser: num("SENSEFUL_GRADE_LIMIT_PER_USER", 50),
  gradeLimitTotal: num("SENSEFUL_GRADE_LIMIT_TOTAL", 300),
  /** 입력 길이 상한 */
  answerMaxLength: 300,
  reportMaxLength: 500,
  /** 레벨마다 새 카드가 가장 적게 남은 사용자의 남은 수가 이보다 적으면 관리자 화면에서 경고한다(하루 상한 5일분). */
  stockWarnBelow: 100,
  /** 카드 생성 모델(2-3-3 결정) */
  genModel: process.env.SENSEFUL_GEN_MODEL || "claude-opus-5-5",
  /** 정답 판정 모델(2-5 결정). 정정 기록을 보고 바꿀 수 있게 설정값으로 둔다. */
  gradeModel: process.env.SENSEFUL_GRADE_MODEL || "claude-opus-5-5",
};

/** 관리자 이메일(비밀 값). 코드에 쓰지 않고 환경 변수에서만 읽는다. */
export function adminEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}
