// 배포 뒤 점검(문서 4.8-13). 배포된 사이트를 밖에서 요청해 확인한다. 상태를 바꾸는 요청(로그인, 판정, 쓰기)은 하지 않는다.
// 사용: npm run smoke [-- <주소>]  (기본 https://senseful.vercel.app)
// 항목별 통과·실패를 출력하고, 하나라도 실패하면 종료 코드 1로 끝난다.
import "./env";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SITE_URL } from "@/config";
import { BasisMissingError, loadBasis, scanText, WEB } from "./checks/basis";
import { checkJsonLd, checkPublicPage, checkRobots, checkSitemap, DEV_LOGIN_MARKER, iconHrefs, isNoindex, PUBLIC_PATHS } from "./checks/page-rules";

const base = (process.argv[2] || SITE_URL).replace(/\/$/, "");
const results: { name: string; ok: boolean; note?: string }[] = [];
const record = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function get(p: string, init: RequestInit = {}): Promise<Response> {
  return fetch(p.startsWith("http") ? p : `${base}${p}`, { redirect: "manual", ...init, signal: AbortSignal.timeout(20_000) });
}

const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");

async function step(name: string, fn: () => Promise<string[] | void>) {
  try {
    const bad = (await fn()) ?? [];
    record(name, bad.length === 0, bad.join("; ") || undefined);
  } catch (e) {
    record(name, false, (e as Error).message);
  }
}

async function main() {
  console.log(`배포 뒤 점검: ${base}`);
  let basis: ReturnType<typeof loadBasis> | null = null;
  try {
    basis = loadBasis();
  } catch (e) {
    if (!(e instanceof BasisMissingError)) throw e;
    record("검사 기준 읽기", false, e.message);
  }
  const pages = new Map<string, string>();
  const assets = new Set<string>();

  for (const p of PUBLIC_PATHS) {
    await step(`${p} 200과 페이지 정보(제목·설명·canonical·미리보기·아이콘)`, async () => {
      const r = await get(p);
      if (r.status !== 200) return [`상태 ${r.status}`];
      const html = await r.text();
      pages.set(p, html);
      for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/_next\/[^"]+\.(?:js|css))"/g)) assets.add(m[1]);
      return [...checkPublicPage(html, p), ...(p === "/" ? checkJsonLd(html) : []), ...(r.headers.get("x-robots-tag")?.includes("noindex") ? ["X-Robots-Tag noindex"] : [])];
    });
  }
  await step("/robots.txt", async () => {
    const r = await get("/robots.txt");
    return r.status === 200 ? checkRobots(await r.text()) : [`상태 ${r.status}`];
  });
  await step("/sitemap.xml", async () => {
    const r = await get("/sitemap.xml");
    return r.status === 200 ? checkSitemap(await r.text()) : [`상태 ${r.status}`];
  });
  await step("og:image 200, 확정 og.png와 같음", async () => {
    const r = await get("/og.png");
    if (r.status !== 200) return [`상태 ${r.status}`];
    const got = md5(Buffer.from(await r.arrayBuffer()));
    const want = md5(fs.readFileSync(path.join(WEB, "public/og.png")));
    const confirmed = path.join(WEB, "../docs/specs/2026-10-public-deploy/design/og/og.png");
    const bad = got === want ? [] : ["public/og.png와 다릅니다"];
    if (fs.existsSync(confirmed) && md5(fs.readFileSync(confirmed)) !== got) bad.push("확정 이미지와 다릅니다");
    return bad;
  });
  await step("파비콘 파일 200", async () => {
    const hrefs = new Set(iconHrefs(pages.get("/") ?? ""));
    if (hrefs.size < 3) return ["아이콘 링크가 모자랍니다"];
    const bad: string[] = [];
    for (const h of hrefs) {
      const r = await get(h);
      if (r.status !== 200) bad.push(`${h.split("?")[0]} ${r.status}`);
    }
    return bad;
  });
  await step("로그인이 필요한 화면은 로그인 없이 소개 화면으로 간다", async () => {
    const bad: string[] = [];
    for (const p of ["/home", "/study", "/settings", "/admin"]) {
      const r = await get(p);
      const loc = r.headers.get("location") ?? "";
      const toLanding = [301, 302, 303, 307, 308].includes(r.status) && (loc === "/" || loc === `${base}/`);
      if (!toLanding && !(r.status === 200 && isNoindex(await r.text()))) bad.push(`${p} 상태 ${r.status}`);
    }
    return bad;
  });
  await step("API는 로그인 없이 막힌다(인증 경로 제외)", async () => {
    const bad: string[] = [];
    for (const p of ["/api/anything", "/api/study", "/api/admin"]) {
      const r = await get(p);
      if (r.status !== 401) bad.push(`${p} 상태 ${r.status}`);
    }
    return bad;
  });
  await step("관리자 화면은 로그인 없이 막힌다", async () => {
    const r = await get("/admin");
    return [301, 302, 303, 307, 308].includes(r.status) ? [] : [`상태 ${r.status}`];
  });
  await step("테스트 로그인 경로가 동작하지 않는다", async () => {
    const bad: string[] = [];
    for (const as of ["admin", "user1"]) {
      const r = await get(`/api/auth/${DEV_LOGIN_MARKER}?as=${as}`);
      if (r.headers.get("set-cookie")?.includes("senseful_session")) bad.push(`${as}: 세션 쿠키를 줍니다`);
      if ((r.headers.get("location") ?? "").includes("/home")) bad.push(`${as}: 홈으로 보냅니다`);
      if (r.status !== 404) bad.push(`${as}: 상태 ${r.status}(404여야 합니다)`);
    }
    return bad;
  });
  await step("HTML·JS·CSS에 금지 문자열·원문 문자열·비밀 값이 없다", async () => {
    if (!basis) return ["검사 기준이 없습니다"];
    const bad: string[] = [];
    const scan = (name: string, text: string) => {
      const s = scanText(text, basis!);
      if (s.forbidden || s.source || s.secret) bad.push(`${name}: 금지 ${s.forbidden}, 원문 ${s.source}, 비밀 ${s.secret}`);
      if (text.includes(DEV_LOGIN_MARKER)) bad.push(`${name}: 테스트 로그인 흔적`);
    };
    for (const [p, html] of pages) scan(p, html);
    for (const a of assets) {
      const r = await get(a);
      if (r.status !== 200) bad.push(`${a} 상태 ${r.status}`);
      else scan(a, await r.text());
    }
    if (assets.size === 0) bad.push("불러오는 JS·CSS를 찾지 못했습니다");
    return bad;
  });
  await step("HTTPS로만 열리고 http는 https로 넘어간다", async () => {
    if (!base.startsWith("https://")) return ["주소가 https가 아닙니다"];
    const r = await get(base.replace("https://", "http://") + "/");
    const loc = r.headers.get("location") ?? "";
    return [301, 302, 307, 308].includes(r.status) && loc.startsWith("https://") ? [] : [`http 상태 ${r.status}`];
  });
  await step("사용 분석 스크립트(/_vercel/insights/script.js) 200", async () => {
    // Vercel 프로젝트에서 Web Analytics가 꺼져 있으면 404다.
    const r = await get("/_vercel/insights/script.js");
    return r.status === 200 ? [] : [`상태 ${r.status}`];
  });

  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n✗ 배포 뒤 점검 실패 ${failed}건 / ${results.length}건` : `\n✓ 배포 뒤 점검 모두 통과 (${results.length}건)`);
  process.exit(failed ? 1 : 0);
}

main();
