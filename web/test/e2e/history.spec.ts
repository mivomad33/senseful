// 판정 결과 다시 보기 E2E(docs/specs/2026-10-result-history 4.1~4.4). 데스크톱과 375px 폭에서 각각 돈다.
// 가짜 판정은 답에 "틀림"이 들어 있으면 틀림, 아니면 맞음이다.
import { expect, test, type Page } from "@playwright/test";

/** 프로젝트마다 다른 새 테스트 사용자를 써 flows.spec.ts의 사용자와도 겹치지 않게 한다. */
const userFor = (project: string, n: number) => `user${(project === "desktop" ? 100 : 200) + n}`;

async function login(page: Page, as: string) {
  await page.goto(`/api/auth/dev-login?as=${as}`);
  await expect(page).toHaveURL(/\/home$/);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const answerBox = (page: Page) => page.getByRole("textbox", { name: "번역" });
const position = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();
const myAnswer = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();
const pastLink = (page: Page) => page.getByRole("button", { name: "← 지난 결과 보기" });

/** 답을 내고 판정 결과 화면의 정답 번역을 돌려준다. */
async function answer(page: Page, text: string): Promise<string> {
  await answerBox(page).fill(text);
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("정답 번역")).toBeVisible();
  return correctKo(page);
}
const correctKo = async (page: Page) => (await page.getByText("정답 번역").locator("..").locator("span").nth(1).textContent()) ?? "";
/** 진행 막대 옆의 "답한 수 / 전체" */
const progress = (page: Page) => page.getByTitle("오늘 답한 수 / 답한 수 + 남은 카드").textContent();

/** 서버 액션 요청(Next-Action 헤더가 붙은 POST)을 센다. */
function countActions(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) seen.push(r.url());
  });
  return seen;
}

test("결과 넘겨 보기: Esc·←·→·Enter, 풀던 답안 유지, 지난 결과 정정과 신고", async ({ page }, info) => {
  await login(page, userFor(info.project.name, 1));
  await page.goto("/study");
  await expect(answerBox(page)).toBeVisible();
  await expect(pastLink(page)).toHaveCount(0);

  const ko1 = await answer(page, "첫째 답");
  await page.getByRole("button", { name: "다음 카드" }).click();
  const ko2 = await answer(page, "둘째 답 틀림");
  // 판정 직후 정정한 결과는 넘긴 뒤 돌아와도 정정한 값이다(4.2-1).
  await page.getByRole("button", { name: "맞음으로 정정" }).click();
  await expect(page.getByText("(정정함)")).toBeVisible();
  await page.getByRole("button", { name: "다음 카드" }).click();
  const ko3 = await answer(page, "셋째 답");
  await page.getByRole("button", { name: "다음 카드" }).click();
  await expect(answerBox(page)).toHaveValue("");
  await expect(pastLink(page)).toBeVisible();

  // 문제 화면의 ←는 입력란 커서만 움직인다.
  await answerBox(page).fill("쓰다 만 답");
  await answerBox(page).press("ArrowLeft");
  await expect(answerBox(page)).toBeVisible();

  // 지난 결과를 오가고 돌아오는 동안 서버 액션 요청이 없고, 쓰던 답안이 그대로다.
  const actions = countActions(page);
  const before = await progress(page);
  await answerBox(page).press("Escape");
  await position(page, "결과 3 / 3");
  await myAnswer(page, "셋째 답");
  expect(await correctKo(page)).toBe(ko3);
  await expect(page.getByRole("button", { name: "다음 결과" })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await position(page, "결과 1 / 3");
  await myAnswer(page, "첫째 답");
  expect(await correctKo(page)).toBe(ko1);
  await expect(page.getByRole("button", { name: "이전 결과" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await position(page, "결과 2 / 3");
  await myAnswer(page, "둘째 답 틀림");
  expect(await correctKo(page)).toBe(ko2);
  expect(await progress(page)).toBe(before);
  await expect(page.getByText("맞음", { exact: true })).toBeVisible();
  await expect(page.getByText("(정정함)")).toBeVisible();
  await noHorizontalScroll(page);
  await page.keyboard.press("Enter");
  await expect(answerBox(page)).toHaveValue("쓰다 만 답");
  expect(actions).toEqual([]);
  expect(await progress(page)).toBe(before);

  // 버튼으로도 이동한다(터치 폭 포함).
  await pastLink(page).click();
  await position(page, "결과 3 / 3");
  await page.getByRole("button", { name: "이전 결과" }).click();
  await position(page, "결과 2 / 3");

  // 지난 결과에서 정정하면 다른 결과에 갔다 와도 바뀐 값이 남는다(4.2-2). 원래 판정(틀림)으로 되돌아가 "(정정함)"은 사라진다.
  await page.getByRole("button", { name: "틀림으로 정정" }).click();
  await expect(page.getByText("틀림", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await position(page, "결과 3 / 3");
  await page.keyboard.press("ArrowLeft");
  await position(page, "결과 2 / 3");
  await expect(page.getByText("틀림", { exact: true })).toBeVisible();
  await expect(page.getByText("(정정함)")).toHaveCount(0);

  // 신고 입력을 연 동안은 ←로 움직이지 않는다. 신고 표시는 그 결과에만 남는다.
  await page.getByRole("button", { name: "오류 신고" }).click();
  const note = page.getByRole("textbox", { name: /어떤 점이 틀렸습니까/ });
  await note.fill("설명");
  await note.press("ArrowLeft");
  await position(page, "결과 2 / 3");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByText("신고를 보냈습니다. 고맙습니다.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await position(page, "결과 3 / 3");
  await expect(page.getByRole("button", { name: "오류 신고" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("신고를 보냈습니다. 고맙습니다.")).toBeVisible();

  // 정정한 카드는 맨 앞 카드가 아니므로 풀던 문제로 그대로 돌아간다.
  await page.getByRole("button", { name: "풀던 문제로" }).click();
  await expect(answerBox(page)).toHaveValue("쓰다 만 답");
});

test("같은 카드를 다시 푼 앞선 결과는 정정할 수 없고, 빼기는 같은 카드의 결과 모두에 보이며, 완료 화면에서 정정하면 다시 불러온다", async ({ page }, info) => {
  page.on("dialog", (d) => d.accept());
  await login(page, userFor(info.project.name, 2));
  await page.goto("/settings");
  await page.getByRole("spinbutton").fill("1");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장했습니다")).toBeVisible();
  await page.goto("/study");

  // 새 카드 한 장을 틀린 뒤 기다리지 않고 바로 다시 푼다.
  await answer(page, "처음 답 틀림");
  await page.getByRole("button", { name: "다음 카드" }).click();
  await page.getByRole("button", { name: "기다리지 않고 바로 보기" }).click();
  await answer(page, "다시 푼 답");

  await page.keyboard.press("ArrowLeft");
  await position(page, "결과 1 / 2");
  await expect(page.getByText("이후에 다시 풀어 이 결과는 정정할 수 없습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: /으로 정정$/ })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "틀림으로 정정" })).toBeVisible();

  // 나만 빼기는 카드 단위라 같은 카드의 다른 결과에도 보인다. 되돌려 둔다.
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "나만 빼기" }).click();
  await expect(page.getByText("이 카드를 뺐습니다. 다시 나오지 않습니다.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await position(page, "결과 2 / 2");
  await expect(page.getByText("이 카드를 뺐습니다. 다시 나오지 않습니다.")).toBeVisible();
  await page.getByRole("button", { name: "빼기 취소" }).click();
  await expect(page.getByRole("button", { name: "나만 빼기" })).toBeVisible();

  // 오늘 학습 완료 화면까지 맞힌다(다시 볼 카드가 남으면 바로 본다).
  const done = page.getByRole("heading", { name: "오늘 학습 완료" });
  for (let i = 0; i < 6 && !(await done.isVisible()); i++) {
    if (await page.getByRole("button", { name: "다음 카드" }).isVisible()) await page.getByRole("button", { name: "다음 카드" }).click();
    await expect(answerBox(page).or(done).or(page.getByRole("button", { name: "기다리지 않고 바로 보기" }))).toBeVisible();
    if (await page.getByRole("button", { name: "기다리지 않고 바로 보기" }).isVisible()) await page.getByRole("button", { name: "기다리지 않고 바로 보기" }).click();
    if (await answerBox(page).isVisible()) await answer(page, `맞힌 답 ${i}`);
  }
  await expect(done).toBeVisible();
  await expect(pastLink(page)).toBeVisible();

  // 완료 화면에서 최근 결과를 틀림으로 정정하면, 돌아갈 때 다시 불러와 그 카드가 다시 나온다.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "틀림으로 정정" })).toBeVisible();
  await page.getByRole("button", { name: "틀림으로 정정" }).click();
  await expect(page.getByText("틀림", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다음 카드" }).click();
  await expect(answerBox(page).or(page.getByRole("button", { name: "기다리지 않고 바로 보기" }))).toBeVisible();
  await expect(done).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("판정 중에는 지난 결과 링크를 누를 수 없다", async ({ page }, info) => {
  await login(page, userFor(info.project.name, 3));
  await page.goto("/study");
  await answer(page, "첫째 답");
  await page.getByRole("button", { name: "다음 카드" }).click();
  await expect(pastLink(page)).toBeEnabled();
  // 판정 요청(서버 액션 POST)을 잠깐 붙잡아 판정 중 상태를 만든다.
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/study", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await answerBox(page).fill("둘째 답");
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByRole("button", { name: "판정 중" })).toBeVisible();
  await expect(pastLink(page)).toBeDisabled();
  release();
  await expect(page.getByText("결과 2 / 2", { exact: true })).toBeVisible();
  await page.unroute("**/study");
});
