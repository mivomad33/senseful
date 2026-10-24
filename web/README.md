# Senseful 앱

Next.js(App Router) + Neon Postgres + Drizzle ORM. 운영은 Vercel(`https://senseful.vercel.app`, 함수 리전 `sin1`)이다.
카드 생성처럼 로컬 수집 DB(`data/app.db`, git·배포 제외)가 필요한 일은 로컬 맥에서 명령으로 한다.

## 처음 설정

Node 24(`.nvmrc`)를 쓴다. 저장소 루트의 `.githooks`를 push 전 훅으로 쓰도록 `npm install`이 연결한다(`prepare`).

```bash
cd web
npm install
cp .env.example .env.local   # 값을 채운다(아래 "환경 변수")
npm run dev                  # http://localhost:3000, 개발 DB를 쓴다
```

백업에는 서버와 같은 버전의 `pg_dump`가 필요하다: `brew install postgresql@18`.

## 환경 변수

`web/.env.local`에만 둔다(커밋하지 않는다). 예시는 `.env.example`이다. 하루 한도 같은 비밀이 아닌 설정은 `src/config.ts`의 기본값을 쓰고, 필요하면 아래 이름으로 바꾼다.

| 이름 | 쓰는 곳 |
| --- | --- |
| `ANTHROPIC_API_KEY` | 판정, 카드 생성 |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | 개발 DB(Neon `dev` 브랜치). 개발 서버와 `--dev` 명령. Vercel에서는 `DATABASE_URL`에 운영 DB 풀링 주소를 넣는다 |
| `PROD_DATABASE_URL`, `PROD_DATABASE_URL_UNPOOLED` | 운영 DB(Neon `production` 브랜치). 관리 명령(백업, 마이그레이션, 이전, 카드 생성) |
| `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_DEV_BRANCH_ID`, `NEON_PROD_BRANCH_ID` | 개발 DB 초기화, 테스트 브랜치 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 구글 로그인 |
| `ADMIN_EMAIL` | 관리자 구글 계정 이메일(아래 "관리자") |
| `SENSEFUL_GRADE_LIMIT_PER_USER`, `SENSEFUL_GRADE_LIMIT_TOTAL` | 하루 판정 한도(기본 50, 300) |
| `SENSEFUL_DAY_START_HOUR` | 하루가 바뀌는 시각(한국 시간, 기본 4) |
| `SENSEFUL_REVIEWS_PER_DAY`, `SENSEFUL_EXTRA_NEW_STEP` | 하루 복습 상한(200), "새 카드 더 학습" 장수(10) |
| `SENSEFUL_GRADE_MODEL`, `SENSEFUL_GEN_MODEL` | 판정·생성 모델(기본 `claude-opus-5-5`) |

Vercel 환경 변수는 **Production에만** 넣는다: `DATABASE_URL`(운영 풀링 주소), `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`.
`vercel env pull`은 `.env.local`을 덮어쓰므로 쓰지 않는다.

## 개발 DB

개발 서버(`npm run dev`)와 `--dev` 명령은 Neon `dev` 브랜치를 쓴다. 개발 서버는 켤 때 마이그레이션을 적용하고, 화면 오른쪽 위에 "개발 DB"가 보인다.

- 운영 DB의 지금 상태로 되돌리기: `npm run db:dev-reset` (개발 DB의 데이터는 사라진다)
- 테스트 로그인(개발 서버에서만): `http://localhost:3000/api/auth/dev-login?as=admin`(관리자), `?as=user1`, `?as=user2` …
  `next dev`에서만 경로가 생기고 빌드 결과물에는 없다(`next.config.ts`의 `pageExtensions`).
- 구글 로그인을 개발 서버에서 확인하려면 `http://localhost:3000`으로 접속한다(Google에 등록한 주소).

## 명령

관리 명령의 기본 대상은 **운영 DB**이고 `--dev`를 붙이면 개발 DB다. 운영 DB를 바꾸는 명령은 실행 전에 자동으로 백업한다.

| 명령 | 하는 일 |
| --- | --- |
| `npm run cards:generate -- <장수> [--level b1] [--dev]` | 카드 생성(아래) |
| `npm run db:backup [-- --dev] [-- 폴더]` | 원격 DB를 `data/backups/`에 SQL 파일로 받는다 |
| `npm run db:migrate [-- --dev]` | 마이그레이션 적용 |
| `npm run db:import-local [-- --dev]` | 로컬 수집 DB의 항목·카드·내 학습 기록을 원격으로 옮긴다(처음 이전, 다시 실행해도 기록은 두 번 옮기지 않는다) |
| `npm run db:reset-progress -- <이메일> [--dev]` | 한 사용자의 학습 기록 초기화(확인을 받는다) |
| `npm run db:dev-reset` | 개발 DB를 운영 DB 상태로 되돌린다 |

### 카드 생성

카드는 공용이고 관리자가 로컬 맥에서 원할 때 만든다. 뜻풀이가 로컬 `data/app.db`에만 있어서 서버에서는 만들 수 없다.

```bash
npm run cards:generate -- 200            # 카드가 없는 항목 중 가장 낮은 레벨부터 200장
npm run cards:generate -- 200 --level b1 # B1에서만(모자라면 있는 만큼만)
```

- 장수는 이번 실행에서 새로 만들 장수다. 원격에서 카드가 없는 항목만 고르므로, 끊긴 뒤 다시 실행해도 만든 카드를 다시 만들지 않는다.
- 20장씩 묶어 Claude API(Opus 5.5)를 부르고, 진행 상황(만든 수, 실패 수)과 비용을 출력한다. 20장에 약 $0.1이다.
- 실패한 항목은 카드 없이 남아 다음 실행 때 다시 후보가 된다. 카드 내용에 뜻풀이 원문이 그대로 들어가면 실패로 보고 한 번 다시 만든다. 금지 문자열(출처 표시)은 카드에서 보지 않는다(생성 입력에 출처 정보가 없어 예문의 지명만 잘못 걸리기 때문이다).
- 관리자 화면의 "카드 재고"가 레벨별로 부족을 알리고 그 레벨의 명령을 보여 준다.

### 읽기 글 생성

목표 레벨(A1~C1) 어휘로 쓴 영어 이야기를 관리자가 로컬에서 만든다. 아직 어느 글에도 나오지 않은 그 레벨 단어를 뽑아 넘기면, 스킬이 한 줄만 들어도 궁금한 설정(시간 이동, 빙의, 갑작스러운 행운, 특수 능력, 비밀, 생존)으로 대사가 많은 이야기 한 권을 쓴다. 이야기를 쌓아 가며 레벨의 단어 전체를 덮는 것이 목표다. 이야기는 Claude Code 세션 안에서 스킬이 쓰고(구독 사용량을 쓰고 API는 부르지 않는다), 레벨 판단과 저장은 명령이 한다. 앱에는 아직 올리지 않는다.

Claude Code에서 스킬을 실행한다.

```text
/reading-gen a2            # A2 이야기 1권(설정은 AI가 고른다)
/reading-gen b1 2          # B1 이야기 2권
/reading-gen a2 빙의        # 소재를 정해 1권
/reading-gen a1 2 조선인이 현대 서울에 떨어진다
```

레벨 다음 인자가 정수일 때만 권수이고, 그 뒤(정수가 아니면 레벨 뒤 전체)는 소재다. 스킬은 권마다 단어 뽑기 → 설정·훅·줄거리 설계 → 장마다 쓰고 바로 재기 → 장마다 고치기(최대 3번) → 저장을 하고, 끝나면 권마다 결과(설정과 훅, 장마다 비율, 대사 비율, 넘긴 단어 중 쓴 수, 새로 덮은 단어 수)를 보여 준다. 한 권이 길어 세션이 끊겨도, 설계 파일의 상태가 "쓰는 중"이면 다음 실행이 그 권을 이어 쓴다. 초안과 설계는 `data/reading-drafts/`, 뽑기 기록은 `data/reading-picks/`, 통과한 이야기는 `data/readings/<레벨>/<날짜>-<제목>.md`에 쌓인다(모두 git 제외).

명령은 스킬이 부르지만 직접 써도 된다.

| 명령 | 하는 일 |
| --- | --- |
| `npm run reading:coverage [-- --level a1 --list] [--json]` | 레벨마다 레벨 단어 수, 덮인 수, 남은 수. `--list`면 그 레벨의 남은 단어 |
| `npm run reading:pick -- <레벨> [--seed 1] [--json]` | 아직 덮이지 않은 그 레벨 단어를 무작위로 뽑고(A1 150, A2 180, B1 200, B2·C1 250개, 남은 것이 적으면 모두) 뽑기 ID와 함께 기록한다 |
| `npm run reading:measure -- <파일> [--json \| --brief]` | 이야기는 장마다, 짧은 글은 한 편을 잰다(넘는 단어 비율과 목록, 단어 수, 대사 비율, 넘긴 단어 중 쓴 수, 고유명사). `--brief`는 스킬이 장마다 읽는 짧은 JSON이다. 종료 코드 통과 0, 미달 1, 입력 오류 2 |
| `npm run reading:save -- <초안>` | 다시 재서 통과한 이야기(또는 짧은 글)만 저장한다. 같은 이름이 있으면 덮어쓰지 않는다 |
| `npm run reading:words -- <레벨>` | 그 레벨 이하 단어를 레벨별로 보여 준다(쓰기 전 참고) |

- 통과 기준(이야기): 장 수가 A1·A2 9~11개, B1~C1 11~13개이고, **장마다** 목표 레벨을 넘는 단어가 단어 종류 기준 5% 이하이며 장 단어 수(장 제목 포함)가 목표의 ±20% 안이다(A1 500, A2 800, B1 1,000, B2 1,250, C1 1,500). 한 권 전체로는 넘긴 단어의 60% 이상을 쓰고, 큰따옴표(`"…"`, `“…”`) 안 단어가 전체 단어의 30% 이상이어야 한다(작은따옴표는 세지 않고, 문단 끝에 열린 큰따옴표는 입력 오류). 장 제목은 장과 함께, 책 제목은 따로 재서 넘는 단어가 없어야 한다. 고유명사(등장인물 이름)는 이야기 전체를 보고 판별한다. 값은 `src/lib/reading/rules.ts`에 있다.
- 뽑기 기록: 저장 위치 밖의 초안을 재거나 저장할 때, 초안의 `given`이 `pick_id`의 뽑기 기록과 레벨·단어·개수까지 같아야 하고, 그 뽑기를 저장된 다른 이야기가 쓰지 않았어야 한다(다르면 입력 오류). 저장된 파일을 지우면 같은 뽑기로 다시 저장할 수 있다. 저장 위치 안의 파일을 다시 잴 때는 대조하지 않는다.
- 덮기: 저장 위치의 모든 글(이야기와 예전의 짧은 글)을 그때 다시 재서 구한다. 따로 저장한 목록이 없으므로, 파일을 지우면 그 글의 단어는 다시 남은 단어가 된다. 본문의 단어를 원형 후보로 바꿨을 때 그 단어가 후보에 있으면 덮인 것이다(outer처럼 측정이 out으로 세는 단어도 나오면 덮인다). 고유명사로 뺀 단어는 덮지 않고, ice cream 같은 띄어 쓴 표제어는 묶음으로만 덮는다.
- 단어 레벨은 로컬 `data/app.db`(읽기 전용)의 단어 표제어 중 가장 낮은 레벨이다. 활용형은 원형으로 묶고(went → go, found → find처럼 원형 후보 중 가장 낮은 레벨), 숫자와 고유명사는 세지 않는다. 뜻 단위로는 재지 못한다.
- 이야기 초안 맨 위 정보: `title`, `kind: story`, `level`, `summary`(줄거리 한 줄), `hook`(한 줄 설정), `setting`(설정 유형), `pick_id`(뽑기 ID), `revisions`(장마다 고친 횟수 한 줄씩), `given`(넘긴 단어). 그 아래 본문은 `## 장 제목` 줄로 장을 나눈다. 형식은 `.claude/skills/reading-gen/SKILL.md`에 예가 있다. 저장 파일에는 장마다 대사 비율, 한 권 대사 비율, 쓴 넘긴 단어 수와 필요한 수가 더해진다.
- 짧은 글(1단계 형식: `title`, `topic`, `level`, `news`, `revisions`, `sources`)도 그대로 재고 저장할 수 있다. 스킬은 이제 이야기만 만든다.
- 철자는 영국식이되 -ize를 쓴다(단어 DB와 같다). 미국식 철자는 "목록에 없음"으로 걸린다.

**예외 목록**: 실제로는 쉬운데 단어 DB에 없어 "목록에 없음"으로 걸리는 단어는 `scripts/reading/exceptions.txt`에 사용자가 직접 적는다. 한 줄에 `단어 레벨`(예: `depend b1`)이고 `#` 줄과 빈 줄은 건너뛴다. 형식이 틀린 줄이 있으면 측정이 입력 오류로 멈춘다. 스킬은 이 파일을 고치지 않고 후보만 제안한다.

## 백업과 복원

```bash
npm run db:backup                              # 운영 DB → data/backups/prod-YYYYMMDD-HHMMSS.sql
psql "<운영 DB 풀링하지 않는 주소>" -f <백업 파일>  # 복원(빈 DB에)
```

## 관리자

`ADMIN_EMAIL`과 같은 이메일의 구글 계정이 관리자다. 관리자는 홈의 "관리자"로 관리자 화면에 들어가고, 판정 후 화면과 관리자 화면에서 공용 카드를 고치거나 뺀다.
관리자 판정은 하루 한도와 전체 횟수에서 빠진다.
처음 이전(`db:import-local`)은 관리자 이메일로 계정을 미리 만들고, 그 이메일로 처음 구글 로그인하면 그 계정에 연결된다.

## 테스트

| 명령 | 내용 | 필요한 것 |
| --- | --- | --- |
| `npm test` | 단위 테스트(DB 없음): 하루 경계, 통계 표시, 설정 확인, 말투 검사, 체험 카드 판정 등 | 없음 |
| `npm run test:integration` | 통합 테스트(실제 Postgres): 권한, 사용자 분리, 판정 한도·동시 요청, 설정, 탈퇴, 빼기, 신고, 생성 | `.env.local`의 `NEON_*`(테스트 브랜치 `test`를 만들거나 비운다) |
| `npm run test:e2e` | E2E(Playwright, 데스크톱·375px): 소개·체험 카드, 로그인→학습→판정, 설정, 관리자 | 위와 같음 + `npx playwright install chromium` |

통합·E2E는 Neon `test` 브랜치(운영에서 분기)를 쓰고 시작할 때 스키마를 지운다. 운영·개발 브랜치는 건드리지 않는다. E2E는 3100 포트에 따로 개발 서버를 띄우고 가짜 판정을 쓴다(API 비용 없음).

## verify, push 전 훅, CI

- `npm run verify`: 타입 검사 → 린트 → 단위 테스트 → 빌드. 머지 전에도 돌린다.
- push 전 훅(`.githooks/pre-push`): `verify` → 공개 저장소 검사(`npm run check:repo`와 같은 검사를 push하는 커밋 범위·메시지·브랜치 이름에). 실패하면 push가 멈춘다.
  검사 기준(금지 문자열 목록, 원문 문자열, 비밀 값)은 공개 저장소 밖의 비공개 파일·로컬 DB·`.env.local`에서 읽고, 하나라도 없으면 push를 멈춘다.
- CI(GitHub Actions): 모든 push와 PR에서 "검사"(타입 검사·린트·단위 테스트) → "빌드". 배포하지 않는다.

## DB 스키마 변경

1. `src/db/schema.ts`를 고치고 `npm run db:generate`로 마이그레이션 파일을 만든다(`drizzle/`).
2. 개발 DB: 개발 서버를 켜면 적용된다(또는 `npm run db:migrate -- --dev`).
3. 운영 DB: 배포 전에 `npm run db:migrate`(자동 백업 후 적용).
4. `npm run deploy`

## 배포

Vercel CLI `vercel@65.1.0`을 `npx`로 쓴다(이 맥에 `vercel login`이 돼 있어야 한다). Git 연동은 없어 push로는 배포되지 않는다.

```bash
npm run deploy           # verify → 커밋을 임시 폴더로 꺼내 vercel build → 결과물 검사 → vercel deploy --prebuilt --prod → 배포 뒤 점검
npm run smoke            # 배포 뒤 점검만(기본 https://senseful.vercel.app)
npm run check:output     # 결과물 검사만(.vercel/output)
```

- 커밋하지 않은 변경이 있으면 배포하지 않는다. 작업 폴더가 아니라 커밋된 파일만 꺼내 빌드해, `.env.local`·`data/` 같은 로컬 파일이 결과물에 섞이지 않게 한다.
- 결과물 검사: `data/`·`*.db`·`.env*` 파일, 금지 문자열·원문 문자열·비밀 값, 테스트 로그인 흔적이 없고, 공개 페이지의 제목·설명·canonical·링크 미리보기·아이콘, `robots.txt`·`sitemap.xml`이 정해진 값인지 본다.
- 배포 뒤 점검: 공개 페이지·`robots.txt`·`sitemap.xml`·미리보기 이미지·아이콘, 로그인 없이 막히는 화면·API, 테스트 로그인 경로, 내려오는 HTML·JS·CSS의 금지 문자열, http→https를 밖에서 확인한다(상태를 바꾸는 요청은 하지 않는다).
