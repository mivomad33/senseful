// API 없이 판정(문서 4.4-2): 정규화한 답이 저장된 예문 번역과 같으면 맞음이다.

/** 앞뒤 공백을 지우고, 연속 공백을 하나로, 문장 끝 문장부호를 뺀다. */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\s.!?。！？…~]+$/u, "");
}

export function sameAsModel(answer: string, exampleKo: string): boolean {
  const a = normalizeAnswer(answer);
  return a !== "" && a === normalizeAnswer(exampleKo);
}
