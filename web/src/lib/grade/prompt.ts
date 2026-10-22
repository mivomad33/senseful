// 정답 판정 프롬프트. 2-5에서 검증한 eval/grade/grade-prompt.ts의 v2를 옮겨 왔다.
// 프롬프트 문구를 바꾸면 검증 결과와 달라지므로, 고칠 때는 eval 쪽도 같이 고치고 다시 검증한다.
import { z } from "zod";

export const GradeSchema = z.object({
  reason: z.string().describe("판정 이유. 한국어 한두 문장. 틀림이면 무엇이 빠지거나 달라졌는지"),
  is_correct: z.boolean().describe("맞음이면 true, 틀림이면 false"),
});
export type Grade = z.infer<typeof GradeSchema>;

const HEAD = `당신은 한국인 영어 학습자의 번역 답안을 채점한다. 학습자는 영어 예문 하나를 보고 문장 전체를 한국어로 옮겼다.
답안이 영어 예문의 의미를 빠짐없이, 바꾸지 않고 옮겼으면 맞음, 아니면 틀림이다.

## 입력
- 영어 예문, 대상 표현(학습 중인 표제어)과 그 한국어 뜻, 모범 번역, 학습자 답안

## 원칙
- 비교 기준은 영어 예문이다. 모범 번역은 참고용이다. 모범 번역과 다르게 옮겨도 영어 예문의 의미와 맞으면 맞음이다.
- 표현이 다른 것은 상관없지만, 의미가 줄거나 달라지면 틀림이다.
- 대상 표현의 뜻만 맞고 나머지 의미가 틀려도 틀림이다.
- 기준은 엄격한 편이다. 정도·빈도·수량을 나타내는 말이 빠지거나, 직역이라 한국어로 뜻이 통하지 않거나, 시제·진행이 달라도 틀림이다.`;

const RULES_CORRECT = [
  "의역, 동의어, 어순 차이",
  "존댓말과 반말, 문체 차이",
  "조사·어미 차이, 한국어에서 자연스럽게 빠지는 것(관사, 단수·복수, 대명사 주어 생략)",
  "정도를 조금 키운 관용적 의역",
  "오타와 맞춤법 오류(의미에 영향이 없을 때)",
  "대상 표현의 뜻을 담은 한 단어로 옮긴 것(대상 표현을 따로 드러나게 옮기지 않아도 된다)",
];
const RULES_WRONG = [
  "대상 표현을 다른 뜻으로 옮김",
  "대상 표현을 뜻이 다른 비슷한 말이나 막연한 말로 옮김(뜻의 핵심이나 뉘앙스가 빠짐)",
  "대상 표현의 뜻이 답안에 드러나지 않음",
  "직역해서 한국어로 뜻이 통하지 않음",
  "정도·빈도·수량 수식어 누락",
  "다른 대상을 가리키는 말로 옮김",
  "시제나 진행의 차이",
  "부정이 빠지거나 반대로 들어감, 반대 의미로 옮김",
  "문장 사이의 관계가 바뀜(양보, 원인, 목적, 조건 등)",
  "의도·사역 같은 의미가 빠짐",
  "수량·기간 같은 사실 정보가 틀림",
  "절이나 주요 성분을 빠뜨림",
  "영어 예문과 다른 내용으로 지나치게 의역함",
  "답안이 비었거나 번역을 하지 않음",
];

// 검증 세트의 표제어·예문과 겹치지 않게 새로 만든 예시. 규칙 순서와 같다.
const EX_CORRECT = [
  'He hardly ever eats breakfast. → "그는 아침을 거의 안 먹는다."',
  '"~했습니다"와 "~했어"는 같다.',
  'I bought a new umbrella. → "새 우산 샀어."(주어·관사 생략)',
  'I was starving after the hike. → "등산하고 나니 배고파 죽을 것 같았다."',
  '"우산을 샀어" 대신 "우산을 삿어"',
  'She was wearing dark green shoes. → "그녀는 진초록 신발을 신고 있었다."',
];
const EX_WRONG = [
  'catch a cold(감기에 걸리다) → "감기를 잡았다"',
  'a fair price(적정한) → "괜찮은 가격"',
  'pretend to sleep(자는 척하다) → "잠을 잤다"',
  'The room is still warm. → "방이 아직 따뜻함이 있다"처럼 뜻이 통하지 않는 직역',
  'a slightly higher price → "더 높은 가격"(slightly 누락)',
  'a pear → "사과"',
  'It was raining. → "비가 온다."',
  "I don't think so. → \"그렇게 생각해.\"",
  'so that I could rest(목적) → "쉬어서"(원인)',
  'He had his car repaired.(사역) → "그는 차를 고쳤다."',
  'for three weeks → "3일 동안"',
  'I called her and she was out. → "그녀에게 전화했다."',
  "원문에 없는 내용을 지어내 덧붙이거나 줄거리만 다시 씀",
  "빈 답안, 영어를 그대로 옮겨 적음",
];

function list(items: string[], examples: string[]) {
  return items.map((r, i) => `- ${r}. 예: ${examples[i]}`).join("\n");
}

const TAIL = `## 판정 방법
- 애매하면 틀림으로 한다. 맞음을 틀림으로 판정하면 학습자가 정답을 보고 정정할 수 있지만, 틀림을 맞음으로 판정하면 잘못 옮긴 채 외우게 된다.
  "의미가 어느 정도 통한다", "크게 다르지 않다"는 맞음의 근거가 아니다.
- 다만 위 "맞음으로 본다"에 해당하면(관용적 과장, 오타, 존댓말 등) 애매한 경우가 아니라 맞음이다.
- 아래 질문에 차례로 답한다. 하나라도 "아니오"면 틀림이다.
  1. 대상 표현: 답안의 그 말이 카드의 한국어 뜻과 같은 뜻인가? 비슷하지만 사전에서 다른 뜻으로 쓰이는 말, 더 막연한 말, 핵심 뉘앙스가 빠진 말이면 "아니오"다.
  2. 직역: 한국어 화자가 이 뜻을 전하려고 실제로 이렇게 말하는가? 영어 단어를 하나씩 옮겨 한국어로 다른 뜻이 되거나 어색하게 읽히면 "아니오"다.
  3. 수식어: 정도·빈도·수량·기간을 나타내는 말이 모두 있는가?
  4. 대상: 가리키는 사람·사물·상태가 같은가? 더 구체적이거나 다른 범주의 말로 바꿨으면 "아니오"다.
  5. 나머지: 시제·진행, 부정, 문장 사이의 관계, 의도·사역, 사실 정보, 절과 주요 성분이 모두 맞는가?
- reason에는 "아니오"가 나온 질문과 이유를, 모두 "예"면 그렇다고 한국어 한두 문장으로 쓴다.`;

/** 시스템 프롬프트. 호출마다 같으므로 프롬프트 캐싱 대상이다. */
export const GRADE_SYSTEM = [HEAD, `## 맞음으로 본다\n${list(RULES_CORRECT, EX_CORRECT)}`, `## 틀림으로 본다\n${list(RULES_WRONG, EX_WRONG)}`, TAIL].join("\n\n");

export interface GradeInput {
  headword: string;
  senseKo: string;
  exampleEn: string;
  exampleKo: string;
  answer: string;
}

export function gradeMessage(a: GradeInput): string {
  return [`영어 예문: ${a.exampleEn}`, `대상 표현: ${a.headword} — ${a.senseKo}`, `모범 번역: ${a.exampleKo}`, `학습자 답안: ${a.answer}`].join("\n");
}
