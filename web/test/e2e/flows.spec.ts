// 핵심 흐름 E2E(문서 4.8-1). 데스크톱과 375px 폭에서 각각 돈다.
import { expect, test, type Page } from "@playwright/test";

/** 프로젝트마다 다른 테스트 사용자를 써 서로 영향을 주지 않게 한다. */
const userFor = (project: string, n: 1 | 2) => `user${project === "desktop" ? n : n + 2}`;

async function login(page: Page, as: string) {
  await page.goto(`/api/auth/dev-login?as=${as}`);
  await expect(page).toHaveURL(/\/home$/);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("소개 화면 → 체험 카드 판정(서버 요청 없음)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("번역하며 암기");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" || r.url().includes("/api/")) requests.push(`${r.method()} ${r.url()}`);
  });
  await page.getByRole("button", { name: "예시 답 ①" }).click();
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("맞음", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("다음 복습 2일 뒤").first()).toBeVisible();
  await page.getByRole("button", { name: "다시 해 보기" }).click();
  await page.getByRole("button", { name: "예시 답 ②" }).click();
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("틀림", { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await noHorizontalScroll(page);
});

test("로그인하지 않으면 로그인이 필요한 화면은 소개 화면으로 간다", async ({ page }) => {
  for (const path of ["/home", "/study", "/settings", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
  const api = await page.request.get("/api/anything", { maxRedirects: 0 });
  expect(api.status()).toBe(401);
});

test("테스트 로그인 → 홈 → 학습 → 답 제출 → 판정 후 화면 → 다음 카드", async ({ page }, info) => {
  await login(page, userFor(info.project.name, 1));
  await noHorizontalScroll(page);
  await page.getByRole("link", { name: /학습 시작/ }).click();
  await expect(page).toHaveURL(/\/study$/);
  await page.getByRole("textbox", { name: "번역" }).fill("이것은 예문입니다");
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("맞음", { exact: true })).toBeVisible();
  await expect(page.getByText("정답 번역")).toBeVisible();
  await expect(page.getByRole("button", { name: "오류 신고" })).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "다음 카드" }).click();
  await page.getByRole("textbox", { name: "번역" }).fill("틀림");
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("틀림", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "맞음으로 정정" }).click();
  await expect(page.getByText("(정정함)")).toBeVisible();
});

test("설정 바꾸기(하루 새 카드 수, 레벨 제외) → 홈에 반영", async ({ page }, info) => {
  await login(page, userFor(info.project.name, 2));
  await page.getByRole("link", { name: "설정" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("spinbutton").fill("5");
  await page.getByRole("checkbox", { name: "A1" }).uncheck();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장했습니다")).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("/home");
  const tile = page.locator("div", { has: page.getByText("새 카드", { exact: true }) }).last();
  await expect(tile).toContainText("5");
  await expect(page.getByText("제외", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /학습 시작/ }).click();
  await expect(page).toHaveURL(/\/study$/);
  await expect(page.getByRole("textbox", { name: "번역" })).toBeVisible();
  await expect(page.getByText("A2", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText("A1", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText("0 / 5")).toBeVisible();
  // 레벨을 모두 끄면 저장할 수 없다.
  await page.goto("/settings");
  for (const l of ["A2", "B1", "B2", "C1"]) await page.getByRole("checkbox", { name: l }).uncheck();
  await expect(page.getByText("레벨을 모두 제외할 수는 없습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("관리자 화면은 관리자만 들어간다", async ({ page }, info) => {
  await login(page, userFor(info.project.name, 1));
  await expect(page.getByRole("link", { name: "관리자" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/home$/);
  await login(page, "admin");
  await page.getByRole("link", { name: "관리자" }).click();
  await expect(page.getByRole("heading", { name: "관리자" })).toBeVisible();
  await expect(page.getByText("카드 재고")).toBeVisible();
  await noHorizontalScroll(page);
});
