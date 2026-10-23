// 공개 페이지(검색엔진 수집 대상) HTML의 규칙(문서 4.5-7, 4.5-9, 4.5-10). 배포 결과물 검사와 배포 뒤 점검이 같이 쓴다.
// 페이지마다 값을 하드코딩하지 않고, 페이지 주소로 기대값을 만든다. 제목은 문서가 정한 페이지만 값을 확인한다.
import { SITE_URL } from "@/config";
import { absoluteUrl, DESCRIPTION, OG_IMAGE } from "@/lib/meta";

/** 문서가 제목을 정한 페이지 */
export const PAGE_TITLES: Record<string, string> = {
  "/": "Senseful - 영단어를 뜻 하나씩, 번역하며 암기",
  "/privacy": "개인정보 처리방침 - Senseful",
};
/** 반드시 있어야 하는 공개 페이지 */
export const PUBLIC_PATHS = Object.keys(PAGE_TITLES);

/** 검색엔진 소유 확인 값. 앱 코드(src/lib/meta.ts)와 따로 적어 두어, 앱 쪽 값이 바뀌거나 빠지면 검사가 잡는다(문서 4.3-1). */
const VERIFY = {
  google: "mhxcHCnGlus8pgaYc_t7hBGoj3cvPOkED1D6dSxu30M",
  naver: "85320c79702589f9512228180691795f115237cb",
  daum: "#DaumWebMasterTool:df76102471373e7339279cf70da708189f345bb1b212504c5755bbe078c52675:WoYFtMaR84eZ7MaX1Xjw9A==",
};

export const ROBOTS_TXT = [
  "User-Agent: *",
  "Allow: /",
  "Disallow: /home",
  "Disallow: /study",
  "Disallow: /settings",
  "Disallow: /admin",
  "Disallow: /api/",
  "",
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  "",
  VERIFY.daum,
];
export const SITEMAP_URLS = [`${SITE_URL}/`, `${SITE_URL}/privacy`];

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** <head> 안의 태그 하나의 속성 값 목록 */
function values(html: string, tag: "meta" | "link", key: "name" | "property" | "rel", keyValue: string, attr: "content" | "href"): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))) {
    const t = m[0];
    const k = new RegExp(`\\b${key}="([^"]*)"`).exec(t)?.[1];
    if (k !== keyValue) continue;
    out.push(decode(new RegExp(`\\b${attr}="([^"]*)"`).exec(t)?.[1] ?? ""));
  }
  return out;
}

export function isNoindex(html: string): boolean {
  return values(html, "meta", "name", "robots", "content").some((v) => v.includes("noindex"));
}

/** 아이콘 링크 주소(쿼리 포함). 확인할 파일 목록에 쓴다. */
export function iconHrefs(html: string): string[] {
  return [...values(html, "link", "rel", "icon", "href"), ...values(html, "link", "rel", "apple-touch-icon", "href")];
}

/** 공개 페이지 HTML이 규칙에 맞는지. 어긋난 항목을 돌려준다(값이 아니라 항목 이름). */
export function checkPublicPage(html: string, path: string): string[] {
  const bad: string[] = [];
  const once = (label: string, list: string[], expected?: string) => {
    if (list.length !== 1) bad.push(`${label} ${list.length}개(1개여야 합니다)`);
    else if (expected !== undefined && list[0] !== expected) bad.push(`${label} 값이 다릅니다`);
  };
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
  once("title", titles, PAGE_TITLES[path]);
  if (titles[0] === "") bad.push("title이 비었습니다");
  if (!/<html[^>]*\blang="ko"/.test(html)) bad.push('<html lang="ko">가 없습니다');
  if (isNoindex(html)) bad.push("noindex가 있습니다");
  const url = absoluteUrl(path);
  once("description", values(html, "meta", "name", "description", "content"), DESCRIPTION);
  once("canonical", values(html, "link", "rel", "canonical", "href"), url);
  const og = (p: string, v?: string) => once(`og:${p}`, values(html, "meta", "property", `og:${p}`, "content"), v);
  og("title", "Senseful");
  og("description", DESCRIPTION);
  og("url", url);
  og("site_name", "Senseful");
  og("locale", "ko_KR");
  og("type", "website");
  og("image", `${SITE_URL}${OG_IMAGE.url}`);
  og("image:width", String(OG_IMAGE.width));
  og("image:height", String(OG_IMAGE.height));
  og("image:alt", OG_IMAGE.alt);
  once("twitter:card", values(html, "meta", "name", "twitter:card", "content"), "summary_large_image");
  const icons = iconHrefs(html).map((h) => h.split("?")[0]);
  for (const need of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) if (!icons.includes(need)) bad.push(`아이콘 링크 ${need}가 없습니다`);
  // 검색엔진 소유 확인은 첫 화면만 본다.
  if (path === "/") {
    once("google-site-verification", values(html, "meta", "name", "google-site-verification", "content"), VERIFY.google);
    once("naver-site-verification", values(html, "meta", "name", "naver-site-verification", "content"), VERIFY.naver);
  }
  return bad;
}

/** 소개 화면의 구조화 데이터(JSON-LD) */
export function checkJsonLd(html: string): string[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) return [`JSON-LD ${blocks.length}개(1개여야 합니다)`];
  try {
    const j = JSON.parse(blocks[0][1]);
    const ok =
      j["@type"] === "WebApplication" &&
      j.name === "Senseful" &&
      j.description === DESCRIPTION &&
      j.url === absoluteUrl("/") &&
      j.applicationCategory === "EducationalApplication" &&
      j.operatingSystem === "Web" &&
      j.inLanguage === "ko" &&
      Number(j.offers?.price) === 0 &&
      j.offers?.priceCurrency === "KRW";
    return ok ? [] : ["JSON-LD 필드 값이 다릅니다"];
  } catch {
    return ["JSON-LD를 JSON으로 읽을 수 없습니다"];
  }
}

export function checkRobots(text: string): string[] {
  return text.trim().split("\n").map((l) => l.trim()).join("\n") === ROBOTS_TXT.join("\n") ? [] : ["robots.txt 내용이 다릅니다"];
}

export function checkSitemap(xml: string): string[] {
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  return JSON.stringify(locs) === JSON.stringify(SITEMAP_URLS) ? [] : ["sitemap.xml 주소 목록이 다릅니다"];
}

/** 개발 전용 테스트 로그인 경로의 흔적(결과물·운영 사이트에 없어야 한다) */
export const DEV_LOGIN_MARKER = "dev-login";
