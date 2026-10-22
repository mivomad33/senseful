# Senseful

영단어를 **뜻 하나씩** 예문 번역으로 익히는 학습 웹앱입니다. 예문을 한국어로 번역하면 AI가 의미로 맞았는지 판정하고, 복습 날짜는 간격 반복 알고리즘(FSRS)이 잡아 줍니다.

- 운영 주소: https://senseful.vercel.app
- 구글 계정으로 로그인해 바로 쓸 수 있습니다(하루 판정 횟수에 한도가 있는 베타입니다).

## 무엇을 하는 앱인가

- **뜻 단위 카드**: `run`의 "달리다"와 "(사업체를) 운영하다"처럼 뜻마다 그 뜻이 드러나는 예문 카드가 쉬운 레벨(A1)부터 나옵니다.
- **AI 판정**: 답안을 Claude가 문장 의미로 판정합니다. 말투·어순이 달라도 뜻이 같으면 맞음이고, 판정이 아쉬우면 바로 정정할 수 있습니다. 저장된 번역과 같은 답은 API 없이 맞음입니다.
- **복습 일정**: 맞히면 간격이 늘고 틀리면 몇 분 뒤 다시 나옵니다(FSRS, 하루는 한국 시간 새벽 4시 기준).
- **사용자 설정**: 하루 새 카드 수(1~20장), 학습하지 않을 레벨.
- **관리자 기능**: 공용 카드 수정·빼기, 사용자 오류 신고 처리, 카드 재고와 판정 횟수 확인.

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 웹 | Next.js 16(App Router, Cache Components), React 19, Tailwind CSS 4 |
| DB | Neon Postgres, Drizzle ORM(node-postgres) |
| 인증 | 구글 OAuth(arctic, PKCE) + DB 세션 |
| AI | Claude API(`@anthropic-ai/sdk`, 구조화 출력) — 정답 판정, 카드 생성 |
| 복습 | ts-fsrs |
| 테스트 | node:test(단위·통합, 실제 Postgres), Playwright(E2E, 데스크톱·모바일) |
| 배포 | Vercel(prebuilt 배포, 싱가포르 리전), GitHub Actions(검사·빌드) |

## 개발

앱 코드는 [`web/`](web/)에 있습니다. 설정, 환경 변수, 테스트, 배포 방법은 [web/README.md](web/README.md)를 봅니다.
