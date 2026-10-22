// 앱 설정. 값은 환경 변수(web/.env.local)로 바꾸고, 없으면 아래 기본값을 쓴다.
// 설정 화면은 MVP에서 미뤘다(docs/project_phases.md 3장).
import path from "node:path";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name}=${v}: 숫자가 아니다`);
  return n;
}

const APP_DB = "data/app.db";
const DEV_DB = "data/dev.db";
/** 개발 서버(next dev)인지 */
export const isDev = process.env.NODE_ENV === "development";

export const config = {
  /**
   * SQLite 파일 경로. 상대 경로는 web/ 기준이다. git에서 뺀다.
   * 개발 서버(npm run dev)는 개발 DB, 그 밖(운영 서버, 명령어)은 실제 DB를 쓴다. SENSEFUL_DB_PATH를 주면 그 값이 우선한다.
   */
  dbPath: path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.SENSEFUL_DB_PATH || (isDev ? DEV_DB : APP_DB)),
  /** 실제 학습 DB. 개발 DB를 만들 때 원본이다. */
  appDbPath: path.resolve(/*turbopackIgnore: true*/ process.cwd(), APP_DB),
  /** 개발 DB. 실제 DB의 사본으로, 개발·확인 중 기록이 실제 학습에 섞이지 않게 한다. */
  devDbPath: path.resolve(/*turbopackIgnore: true*/ process.cwd(), DEV_DB),
  /** 하루 새 카드 상한 */
  newPerDay: num("SENSEFUL_NEW_PER_DAY", 20),
  /** "새 카드 더 학습" 한 번에 더하는 장수. 하루 새 카드 상한을 다 쓴 뒤 원할 때만 더한다. */
  extraNewStep: num("SENSEFUL_EXTRA_NEW_STEP", 10),
  /** 하루 복습 상한 */
  reviewsPerDay: num("SENSEFUL_REVIEWS_PER_DAY", 200),
  /** 하루가 바뀌는 시각(로컬 시간, 0~23). Anki 기본값과 같이 새벽 4시다. */
  dayStartHour: num("SENSEFUL_DAY_START_HOUR", 4),
  /** 운영 서버 포트(npm start). 다른 개발 서버의 3000과 겹치지 않게 둔다. */
  port: num("SENSEFUL_PORT", 4747),
  /** 운영 서버가 요청 없이 이 시간(분)이 지나면 스스로 꺼진다. 0이면 끄지 않는다. */
  idleMinutes: num("SENSEFUL_IDLE_MINUTES", 30),
  /** 카드 생성 모델(2-3-3 결정) */
  genModel: process.env.SENSEFUL_GEN_MODEL || "claude-opus-5-5",
  /** 정답 판정 모델(2-5 결정). 정정 기록을 보고 바꿀 수 있게 설정값으로 둔다. */
  gradeModel: process.env.SENSEFUL_GRADE_MODEL || "claude-opus-5-5",
};
