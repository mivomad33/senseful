// 메일 링크 주소와 제목(문서 4.2-3, 4.4-1, 4.5-8)
import assert from "node:assert/strict";
import { test } from "node:test";
import { FEEDBACK_MAILTO, NAG_MAILTO } from "./links";

test("의견 보내기와 개발자에게 조르기는 같은 주소, 다른 제목이다", () => {
  const parse = (m: string) => ({ to: m.split("?")[0], subject: new URLSearchParams(m.split("?")[1]).get("subject") });
  assert.deepEqual(parse(FEEDBACK_MAILTO), { to: "mailto:mivomad33@gmail.com", subject: "Senseful 의견" });
  assert.deepEqual(parse(NAG_MAILTO), { to: "mailto:mivomad33@gmail.com", subject: "Senseful 정식 버전 만들어 주세요" });
});
