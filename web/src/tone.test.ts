// 화면 문구가 합니다체인지 검사한다(문서 4.5-6). 소스에서 문자열·템플릿·JSX 글자만 뽑아 본다(주석은 보지 않는다).
// 검사 범위: src/app, src/components와 서버 동작이 화면에 돌려주는 문구를 만드는 src/lib.
// 제외: 테스트, 판정·생성 프롬프트(검증한 프롬프트라 고치지 않는다), 카드 내용 예시(소개 화면 체험 카드), 개발자용 오류(console 출력, new Error).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { findHaera } from "./lib/tone";

const SRC = path.resolve(import.meta.dirname);
const EXCLUDE = [/\.test\.tsx?$/, /lib[/\\]grade[/\\]prompt\.ts$/, /lib[/\\]card-gen[/\\]prompt\.ts$/, /app[/\\]_landing[/\\]content\.ts$/, /lib[/\\]tone\.ts$/];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) && !EXCLUDE.some((x) => x.test(p)) ? [p] : [];
  });
}

/** 개발자용 문구인지: console.*(...)의 인자나 new Error(...)의 인자 */
function developerOnly(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === "console") return true;
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "Error") return true;
  }
  return false;
}

function texts(file: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const add = (node: ts.Node, text: string) => {
    if (/[가-힣]/.test(text) && !developerOnly(node)) out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text);
    else if (ts.isJsxText(node)) add(node, node.text.trim());
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

test("해라체 판별 규칙", () => {
  for (const bad of ["다시 제출할 수 있다.", "이 카드를 뺄까?", "`${a} 다시 나온다`", "끝냈다", "하자.", "보라."]) assert.notEqual(findHaera(bad.replace(/`/g, "")).length, 0, bad);
  for (const good of ["다시 제출할 수 있습니다.", "뺄까요?", "다 썼습니다", "예상보다 많습니다.", "뜻마다 카드가 있습니다.", "다시 시도", "하시겠습니까?", "다음 카드", "오늘 학습 완료", "보내 주십시오."]) assert.deepEqual(findHaera(good), [], good);
});

test("화면 문구에 해라체 종결이 없다", () => {
  const issues: string[] = [];
  for (const f of files(SRC)) {
    for (const t of texts(f)) for (const i of findHaera(t.text)) issues.push(`${path.relative(SRC, f)}:${t.line} …${i.snippet}`);
  }
  assert.deepEqual(issues, []);
});
