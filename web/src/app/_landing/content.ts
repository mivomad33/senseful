// 소개 화면 체험 카드와 흐름 예시의 카드 내용(예문, 번역, 예시 답). 카드 내용이라 말투 검사에서 뺀다(문서 4.5-6 예외).
// 체험 카드는 Claude API를 부르지 않고 아래 규칙으로만 판정한다. 결과는 저장하지 않는다.

export const DEMO = {
  exampleEn: "She runs a small bakery in the village.",
  headword: "run",
  senseKo: "(사업체를) 운영하다",
  exampleKo: "그녀는 마을에서 작은 빵집을 운영한다.",
  samples: ["그녀는 마을에서 작은 빵집을 운영한다.", "그녀는 마을에 있는 작은 빵집으로 달려간다."],
  reasonOk: "문장 전체의 의미가 정답과 같습니다.",
  reasonNg: '여기서 run은 "달리다"가 아니라 "운영하다"라는 뜻입니다.',
};

/** 미리 정한 판정 규칙: "운영하다" 계열 말과 "빵집" 계열 말이 모두 있으면 맞음 */
export function demoGrade(answer: string): boolean {
  const a = answer.trim();
  return /운영|경영|꾸려|하고 있/.test(a) && /빵집|베이커리|제과/.test(a);
}

export const FLOW_SENSES = [
  { level: "A1", en: ["I ", "run", " in the park every morning."], sense: "달리다" },
  { level: "B1", en: ["She ", "runs", " a small bakery."], sense: "(사업체를) 운영하다" },
];

export const FLOW_ANSWER = "그 여자는 동네에서 조그만 빵집을 한다.";
