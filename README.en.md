<div align="center">

<img src="web/public/og.png" alt="Senseful: learn English words one sense at a time, by translating" width="720">

# Senseful

**Learn English words one sense at a time, by translating example sentences**

<p>
  <a href="https://senseful.vercel.app"><img src="https://img.shields.io/badge/Live-senseful.vercel.app-111?style=flat-square" alt="Live"></a>
  <a href="https://github.com/mivomad33/senseful/actions"><img src="https://img.shields.io/github/actions/workflow/status/mivomad33/senseful/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/AI-Claude-d97757?style=flat-square" alt="Claude">
</p>

[한국어](README.md) · English

</div>

## How you study

<table>
  <tr>
    <td align="center" width="33%"><img src=".github/assets/readme/study.jpg" alt="Study card: type a Korean translation of the English sentence" width="240"><br><b>1. Translate the sentence</b></td>
    <td align="center" width="33%"><img src=".github/assets/readme/graded.jpg" alt="After grading: correct, with the model translation and the reason" width="240"><br><b>2. AI grades the meaning</b></td>
    <td align="center" width="33%"><img src=".github/assets/readme/home.jpg" alt="Home: today's study and the last 7 days" width="240"><br><b>3. Reviews schedule themselves</b></td>
  </tr>
</table>

The app is for Korean speakers, so its screens are in Korean.

## Features

- 🧩 **One card per sense**: "to run (on foot)" and "to run (a business)" are different cards. Cards start from the easiest level (A1).
- 🤖 **AI grading**: different word order or tone is fine as long as the meaning matches. You can override a verdict right away, and an answer identical to the stored translation is accepted without an API call.
- 📅 **Automatic review schedule**: a spaced-repetition algorithm (FSRS) stretches the interval when you get a card right and brings it back in a few minutes when you miss it.
- ⚙️ **Your pace**: choose how many new cards a day (1–20) and which levels to skip.
- 📱 **Anywhere**: sign in with Google once and continue on your phone or computer. It is a beta with a daily grading limit.

## How it works

```mermaid
flowchart LR
  A[Sense list] -->|generated ahead| B[Card<br>Korean meaning, example, translation]
  B --> C[Today's study]
  C -->|your translation| D{Claude grading}
  D -->|right / wrong| E[FSRS schedule]
  E --> C
```

## Tech stack

| Area | Used |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4 |
| DB | Neon Postgres, Drizzle ORM |
| Auth | Google OAuth 2.0 (PKCE, built in) + DB sessions |
| AI | Claude API (structured output): grading, card generation |
| Reviews | ts-fsrs |
| Tests | node:test (unit and integration on real Postgres), Playwright (E2E, desktop and mobile) |
| Deploy | Vercel (hosting, Web Analytics), GitHub Actions |

## Development

The app lives in [`web/`](web/). See [web/README.md](web/README.md) (Korean) for setup, tests and deployment.
