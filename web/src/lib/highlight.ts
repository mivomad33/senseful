// 판정 후 화면에서 예문 속 표제어를 강조하려고 위치를 찾는다.
// 표제어 그대로이거나 규칙 활용형(-s, -es, -ed, -ing)인 단어만 찾는다. -er(singer)처럼 다른 단어가 되는 형태는 찾지 않는다. 불규칙 활용(went)이나 구는 예문에 그대로 있을 때만 찾고, 못 찾으면 강조하지 않는다.

/** 단어 하나의 규칙 활용형 후보(소문자) */
function forms(w: string): string[] {
  const out = [w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`];
  if (w.endsWith("e")) out.push(`${w.slice(0, -1)}ing`);
  if (w.endsWith("y")) out.push(`${w.slice(0, -1)}ies`, `${w.slice(0, -1)}ied`);
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) out.push(`${w}${w.at(-1)}ed`, `${w}${w.at(-1)}ing`);
  return out;
}

/** 예문에서 표제어가 있는 [시작, 끝) 위치. 없으면 null */
export function findHeadword(sentence: string, headword: string): [number, number] | null {
  const h = headword.toLowerCase().trim();
  if (!h) return null;
  const lower = sentence.toLowerCase();
  // 구(get on with sb 등)는 자리 표시(sb, sth)를 빼고 그대로 있는지만 본다.
  if (/\s/.test(h)) {
    const phrase = h
      .split(/\s+/)
      .filter((t) => !/^(sb|sth|sb\/sth|do|doing)$/.test(t))
      .join(" ");
    const m = phrase ? new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(lower) : null;
    return m ? [m.index, m.index + m[0].length] : null;
  }
  const candidates = new Set(forms(h));
  for (const m of sentence.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)) {
    if (candidates.has(m[0].toLowerCase())) return [m.index, m.index + m[0].length];
  }
  return null;
}
