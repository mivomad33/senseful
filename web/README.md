# Senseful 앱

Next.js(App Router)·Tailwind·Drizzle(SQLite) 앱이다. DB 파일과 사전 수집 데이터는 저장소에 넣지 않는다.

## 처음 설정

Node 24를 쓴다(저장소 루트 `.nvmrc`). Node 버전을 바꾸면 `npm rebuild better-sqlite3`로 네이티브 모듈을 다시 빌드하고 `npm run make-launcher`도 다시 실행한다.

```bash
npm install
npm run db:migrate   # data/app.db 생성·마이그레이션 적용
npm run db:import -- <수집 결과 JSON>   # 사전 수집 결과 → items (다시 실행해도 된다)
npm run dev          # 개발 서버 http://localhost:3000 (개발 DB)
```

테스트는 `npm test`(Node 내장 테스트, 메모리 DB를 쓰고 Claude API를 부르지 않는다)로 돌린다.

## 개발 DB

실제 학습 기록이 개발·확인 중에 바뀌지 않게, 실행 방식에 따라 DB가 갈린다.

| 실행 | DB |
| --- | --- |
| 운영 서버(`npm start`, Dock 아이콘) | `data/app.db` (실제 학습 DB) |
| 개발 서버(`npm run dev`) | `data/dev.db` (개발 DB, 실제 DB의 사본) |
| 명령어(`db:backup`, `db:reset-progress`, `db:import`, `db:migrate`) | `data/app.db` |

- 개발 서버를 처음 켤 때 개발 DB가 없으면 실제 DB를 복사해 만든다. 켤 때마다 마이그레이션도 적용한다.
- 개발 서버 화면 오른쪽 위에 "개발 DB" 표시가 나온다. 이 표시가 없으면 실제 앱이다.
- 개발 DB를 실제 DB의 지금 상태로 되돌리려면 개발 서버를 끄고 아래를 실행한다. 실제 DB는 읽기만 한다.

```bash
npm run db:dev-reset
```

- 명령어를 개발 DB에 쓰려면 `SENSEFUL_DB_PATH=data/dev.db npm run db:reset-progress`처럼 앞에 붙인다.
  기본값을 실제 DB로 둔 것은 백업이 개발 DB를 받는 실수를 막기 위해서다.
- 개발 DB에서도 판정·카드 생성은 실제 Claude API를 부르므로 비용이 든다. 기록만 개발 DB에 남는다.
- 개발 서버도 운영 서버처럼 이 맥(127.0.0.1)에서만 접속을 받는다.

## 매일 쓰기

Dock의 Senseful 아이콘을 누르면 서버가 꺼져 있을 때만 켜고 기본 브라우저로 http://localhost:4747 을 연다.
서버는 요청이 30분(`SENSEFUL_IDLE_MINUTES`) 동안 없으면 스스로 꺼진다. 안 쓸 때 메모리를 쓰지 않기 위해서다.
학습 중에는 답안 제출·다음 카드마다 요청이 가서 꺼지지 않는다. 창을 띄워 둔 채 30분 넘게 자리를 비워 꺼졌으면 아이콘을 다시 누른다.

홈에서 "학습 시작"으로 오늘의 학습을, "새 카드 만들기"로 카드 20장(약 $0.1)을 만든다.
판정과 생성은 Claude API를 부르므로 `.env.local`에 `ANTHROPIC_API_KEY`가 있어야 한다.

### 아이콘 앱 만들기(처음 한 번)

```bash
npm run make-launcher   # ~/Applications/Senseful.app
```

Finder에서 `~/Applications/Senseful.app`을 Dock으로 끌어다 둔다.
앱에는 저장소 위치와 node 경로가 들어 있으므로, 저장소를 옮기거나 node 버전을 바꾸거나 `SENSEFUL_PORT`를 바꾸면 다시 실행한다.
지우려면 앱을 휴지통에 버린다. 시스템 설정이나 로그인 항목은 건드리지 않는다.

- 앱은 `web/`에서 `npm start`를 띄우고 출력은 `data/server.log`에 쌓는다. 빌드(`.next/`)가 없으면 먼저 빌드한다.
- 서버는 켤 때 DB 마이그레이션을 적용한다(이미 적용한 것은 건너뛴다). 스키마가 바뀐 코드를 받아도 따로 `db:migrate`를 하지 않아도 된다.
- 서버가 뜨지 않으면 알림을 띄운다. 이때는 `data/server.log`를 본다.
- macOS는 서명 없는 앱을 거부하므로(-10669) 만들 때 ad-hoc 서명을 붙인다.

### 코드를 바꾼 뒤

```bash
npm run build                          # 새 빌드를 만든다
kill $(lsof -tiTCP:4747 -sTCP:LISTEN)  # 켜져 있는 서버를 끈다. 다음에 아이콘을 누르면 새 빌드로 뜬다
```

### 터미널에서 켜기

`npm start`는 아이콘 앱과 같은 서버(`scripts/serve.ts`)를 띄운다. 이 맥(127.0.0.1)에서만 접속을 받는다.
포트는 다른 개발 서버(대개 3000)와 겹치지 않게 4747로 두었다. 개발 서버(`npm run dev`)는 3000이고 첫 화면이 느리다.

## DB 백업과 복원

학습 기록은 `data/app.db` 하나에만 있다(git 제외). 이 파일을 잃으면 카드와 복습 기록이 모두 사라진다.

```bash
npm run db:backup                      # data/backups/app-YYYYMMDD-HHMMSS.db
npm run db:backup -- ~/Documents/senseful-backups   # 다른 폴더(외장 디스크, 클라우드 동기화 폴더 등)
```

- 앱이 켜져 있어도 된다. SQLite 온라인 백업을 쓰고, 끝나면 무결성 검사와 표별 행 수를 출력한다.
- `data/backups/`는 같은 디스크라 디스크 고장에는 소용없다. 가끔은 다른 폴더로도 받는다.
  비공개 데이터이므로 공개 위치나 공유 폴더에는 두지 않는다.
- 복원: 앱을 끄고 `data/app.db`, `data/app.db-wal`, `data/app.db-shm`을 다른 이름으로 옮긴 뒤, 백업 파일을 `data/app.db`로 복사한다.
  `-wal`·`-shm`을 남겨 두면 옛 기록이 섞일 수 있다.

## 학습 기록 초기화

```bash
npm run db:reset-progress
```

복습 기록(`review_logs`)과 새 카드 더 학습 기록(`study_days`)을 모두 지우고 카드를 새 카드 상태로 되돌린다. 카드 내용(직접 고친 것 포함)과 빼기 표시는 그대로 둔다.

- 지울 수를 보여 주고 `y`를 입력해야 진행한다. 진행하면 먼저 `data/backups/`에 백업하고, 백업이 실패하면 초기화하지 않는다.
- 되돌리려면 출력된 백업 파일로 위의 복원 절차를 따른다.
- 복습 기록은 판정 프롬프트 개선과 FSRS 최적화의 재료이므로, 실사용을 시작한 뒤에는 쓰지 않는 것이 좋다.
- 앱이 켜져 있어도 되지만, 학습 화면을 열어 둔 채 실행했다면 홈에서 다시 들어간다.

## 설정

`web/.env.local`에 환경 변수로 둔다. 없으면 `src/config.ts`의 기본값을 쓴다.

| 변수 | 기본값 | 뜻 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (없음) | Claude API 키 |
| `SENSEFUL_DB_PATH` | 운영 `data/app.db`, 개발 서버 `data/dev.db` | SQLite 파일 경로. 주면 실행 방식과 상관없이 이 값을 쓴다 |
| `SENSEFUL_NEW_PER_DAY` | `20` | 하루 새 카드 상한 |
| `SENSEFUL_EXTRA_NEW_STEP` | `10` | 오늘 카드를 다 끝낸 뒤 "새 카드 더 학습" 한 번에 더하는 장수 |
| `SENSEFUL_REVIEWS_PER_DAY` | `200` | 하루 복습 상한 |
| `SENSEFUL_DAY_START_HOUR` | `4` | 하루가 바뀌는 시각(로컬 시간). 상한과 형제 카드 미루기를 이 시각 기준으로 센다 |
| `SENSEFUL_PORT` | `4747` | 운영 서버(`npm start`, 아이콘 앱) 포트. 바꾸면 `npm run make-launcher`를 다시 실행한다 |
| `SENSEFUL_IDLE_MINUTES` | `30` | 운영 서버가 요청 없이 이 시간(분)이 지나면 스스로 꺼진다. `0`이면 끄지 않는다 |
| `SENSEFUL_GEN_MODEL` | `claude-opus-5-5` | 카드 생성 모델 |
| `SENSEFUL_GRADE_MODEL` | `claude-opus-5-5` | 정답 판정 모델 |

## 스키마 바꾸기

`src/db/schema.ts`를 고친 뒤 `npm run db:generate`로 `drizzle/`에 마이그레이션을 만들고 `npm run db:migrate`로 적용한다.
운영 서버(`npm start`, 아이콘 앱)는 켤 때 마이그레이션을 자동으로 적용한다.
