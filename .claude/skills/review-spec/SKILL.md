---
name: review-spec
description: 자율 구현 명세서(기획·요구사항 문서)를 서브에이전트로 반복 검토해, 큰 문제(차단·중요)가 없을 때까지 고친다. 매 회차 새 서브에이전트가 검토하고, 메인이 지적을 직접 확인해 반영하며, 사용자가 정할 일만 모아 묻는다. 사용자가 "/review-spec <문서>" 라고 요청할 때만 사용한다.
---

# 자율 구현 명세서 반복 검토

입력은 자율 구현 명세서(줄여서 명세서) 하나다(인자로 받은 경로. 없으면 사용자가 가리킨 문서). 정의는 아래 기준 파일 맨 앞에 있다.
이 문서는 AI가 사용자에게 묻지 않고 끝까지 구현할 때 쓰는 것이다(`implement-spec` 스킬이 있으면 그 입력). 그래서 검토의 목적은 하나다. **구현하는 AI가 멈추거나, 사용자가 정할 일을 짐작하거나, 지켜야 할 것을 어기게 되는 곳을 구현 전에 없앤다.**

## 1. 준비

- 문서 전체, 프로젝트 규칙(CLAUDE.md, 기록 문서 등), 구현 스킬이 있으면 그 스킬을 읽는다.
- **명세서 기준 파일**을 읽는다. `write-spec` 스킬이 있으면 그 폴더의 `criteria.md`다(이 스킬 폴더 기준 `../write-spec/criteria.md`). 문서가 갖춰야 할 원칙, 구성(필수 요소·고정 제목·권장 순서), 빠뜨리기 쉬운 것, 목록 밖을 찾는 점검이 거기 있고, 서브에이전트도 이 파일로 검사한다. 없으면 이 단계를 건너뛰고 템플릿의 기준 항목(7번)을 뺀다. 8번(따라가 보기)은 기준 파일이 없어도 한다.
- 문서가 의도적으로 정한 형식을 파악한다. 기준 파일이 있으면 거기 적힌 형식도 의도된 것이다. 서브에이전트가 이것을 문제로 지적하지 않게 지시에 넣기 위해서다.
  예: 설계·계획을 일부러 쓰지 않음, 요구사항에 우선순위를 두지 않음, 권장 순서와 다르게 절을 묶음, 필수 요소 밖의 절을 더함.
- 문서의 종류를 파악한다. 기존 시스템을 바꾸는 변경 건인지, 새로 만드는 신규 개발인지에 따라 대조할 것이 다르다. 신규 개발이면 대조할 코드·데이터가 없거나 적은 대신, 기술 선택과 작업 규칙이 문서에 정해져 있어야 한다.
- 서브에이전트가 대조할 관련 파일(기존 결정 기록, 개요 문서, 시안, 코드, 로컬 데이터 중 있는 것)을 정한다.
- 비공개 데이터와 비밀 값이 어디 있는지 확인한다(예: `.env*`, 로컬 DB). 서브에이전트 지시에 다루는 방법을 넣는다.

## 2. 회차 진행

한 회차는 "검토 → 확인 → 반영"이다.

### 2.1 검토 맡기기

- **매 회차 새 서브에이전트에게 맡긴다.** 앞 회차 맥락이 없어야 같은 관점에 갇히지 않는다. 앞 회차 서브에이전트를 이어 쓰지 않는다.
- 지시는 아래 "검토 지시 템플릿"을 채워 쓴다. 회차 번호와 **지금까지 고친 항목 목록**을 꼭 넣는다.
- 서브에이전트는 읽기만 한다.

### 2.2 지적 확인

서브에이전트의 보고는 그대로 믿지 않는다. 지적마다 메인이 직접 확인한다.

- 코드나 문서 위치를 열어 본다. 데이터에 관한 지적이면 직접 조회한다(읽기 전용).
- 사실이 아니거나, 이미 문서에 있거나, 문서의 의도된 형식을 문제로 본 지적은 반영하지 않는다. 이유를 회차 기록에 남긴다.
- 심각도가 과하거나 낮게 매겨졌으면 메인이 다시 매긴다.

### 2.3 반영

지적을 두 가지로 나눈다.

- **기준만 분명히 하면 되는 것**(검사 방법, 범위, 예외, 문구 충돌 등): 묻지 않고 문서를 고친다. 재량으로 정한 것은 마무리 보고에 적는다.
- **사용자가 정할 것**(비용, 계정·권한, 되돌리기 어려운 행동의 허용, 제품 방향, 감수할 위험): 그 회차의 것을 모아 **한 번에** 묻는다. 선택지마다 영향을 짧게 적고 추천안을 앞에 둔다. 답을 받으면 결정과 이유를 문서에 적는다.
  - 사용자의 결정이 문서 밖에도 남아야 하면(프로젝트의 결정 기록 문서 등) 프로젝트 규칙에 따라 함께 기록한다.

고친 항목은 "지금까지 고친 항목 목록"에 한 줄씩 더한다. 다음 회차 지시에 넣는다.

### 2.4 멈추는 조건

- 한 회차의 결과(메인 확인 후)가 **차단 0건, 중요 0건**이면 멈춘다. 그 회차의 경미 지적은 고치기 쉽고 실제로 헷갈릴 만한 것만 반영한다.
- 차단이나 중요를 고친 회차 다음에는 확인용으로 한 회차를 더 돌린다. 고친 내용이 새 문제를 만들 수 있기 때문이다.
- 최대 8회차까지 돈다. 그래도 차단·중요가 남으면 멈추고, 남은 문제와 이유를 사용자에게 알린다.
- 사용자가 멈추라고 하면 멈춘다.

## 3. 마무리 보고

- 회차별 표: 회차, 차단·중요·경미 수(메인 확인 후), 주요 내용 한 줄
- 사용자가 정한 것
- 메인이 재량으로 정한 것과 이유
- 반영하지 않은 지적과 이유(있으면)
- 문서가 버전 관리되는 위치에 있으면 프로젝트 규칙대로 커밋한다. 버전 관리되지 않는 곳이면 그렇다고 알린다.

## 4. 비공개 데이터 보호

- 서브에이전트는 비밀 값 파일에서 **변수 이름만** 본다. 값을 출력하거나 인용하지 않는다.
- 비공개 데이터(로컬 DB 등)는 읽기 전용으로 조회만 한다. **조회 결과를 파일로 남기지 않는다**(임시 파일 포함). 내용 인용은 짧은 예 하나까지만 한다.
- 메인도 검증할 때 같은 규칙을 지킨다. 검사에 임시 파일이 꼭 필요하면 세션 임시 폴더에 두고 끝나면 바로 지운다.
- 외부 서비스(배포, DB, 결제, API)에는 상태를 바꾸는 요청을 보내지 않는다.

## 검토 지시 템플릿

`<...>`를 채워 서브에이전트에게 준다. 답변 언어는 사용자의 언어로 지정한다.

```
You are reviewing an autonomous implementation spec (a planning/requirements document) before it is handed to an autonomous coding agent. Answer in <사용자 언어>.

Document: <문서 절대 경로>

Context:
- Project: <프로젝트 경로와 한두 줄 설명>
- Kind: <변경 건(changes an existing system) 또는 신규 개발(new build)>
- Use: an AI agent will implement everything from this document WITHOUT asking the user after the start<구현 스킬이 있으면: using the skill at <경로>>. The document must contain every human decision and prerequisite.
- Intentional choices — do not flag these: <예: no design/plan section, no priority among requirements>
- This is review round <N>. Already fixed in earlier rounds: <지금까지 고친 항목 목록, 없으면 "none">. Verify those fixes are correct and consistent; do not re-report them if fine.
- Related files: <대조할 파일 목록>
- Document criteria: <기준 파일 절대 경로>. Read it first. It defines the principles, structure, and easy-to-miss areas this kind of document must meet; what it prescribes is intentional.

Check for real problems only:
1. Undecided or ambiguous points that would make the agent stop or guess on something the user should decide.
2. Contradictions within the document, or with project rules, past decisions, the implementation skill, the code, or the actual data (where they exist; a new build may have little code or data yet).
3. Acceptance checks the agent cannot execute, or that cannot pass given the actual code/data.
4. Missing prerequisites or approvals (accounts, permissions, keys, costs, external actions) that would block an unattended run.
5. Technical infeasibility with the chosen stack and services.
6. Gaps that could leak private data or secrets.
7. Departures from the document criteria that would hurt the implementing agent: a requirement without an executable check, a decision without its reason or rejected options, a required element missing and not marked "해당 없음", a fixed-title section (요구사항, 완료 정의, 준비물, 진행 규칙 with 사전 승인 / 멈추고 물을 것 / AI 재량) missing or scattered across other sections, leftover undecided markers, a technology choice left to the agent that the criteria say the user must decide, or an easy-to-miss area (common, or for this document's kind) that applies but is absent. Skip departures that change nothing for the agent. Section order and extra sections are free; do not flag them.
8. Walk through the implementation: imagine you are the implementing agent and go step by step from start to the final report. At each step, look for a point that needs a human decision, an account or permission, money, an irreversible action, a check the agent cannot run, or something the user must not do meanwhile — and that the document does not already cover. This is how to find problems no checklist names.

Finally, ask: could the agent still stop, guess on a user-level decision, or break something it must keep, using only this document? Report anything left, even if no item above names it.

Rules:
- Read-only. No file edits (including temp files), no state-changing commands, no state-changing calls to external services.
- Secret files (<경로>): list variable NAMES only; never print or quote values.
- Private data (<경로>): read-only queries are fine; never write query results to files; quote at most one short example.
- It is completely fine to conclude there are no problems — say so plainly. Do not invent issues or pad with nitpicks.
- Classify each finding: 차단 (blocks the run or leaks data/secrets), 중요 (the agent would likely guess wrong on a user-level decision, or a check that cannot pass), 경미 (optional). Be honest and conservative about severity.
- For each finding: section, what is wrong, why it matters for the implementing agent, and a concrete fix. Mention what you verified and found fine in one short list.
```
