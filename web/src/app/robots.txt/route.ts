// robots.txt. 소개 화면과 개인정보 처리방침만 수집한다. 로그인 뒤의 화면, 인증 경로, API는 막는다(문서 4.5-10).
// 다음 웹마스터도구 소유 확인 줄을 맨 아래에 두어야 해서 Next의 robots.ts(주석 줄을 못 넣는다) 대신 직접 만든다.
import { SITE_URL } from "@/config";
import { SITE_VERIFICATION } from "@/lib/meta";

const DISALLOW = ["/home", "/study", "/settings", "/admin", "/api/"];

export function GET(): Response {
  const lines = ["User-Agent: *", "Allow: /", ...DISALLOW.map((p) => `Disallow: ${p}`), "", `Sitemap: ${SITE_URL}/sitemap.xml`, "", SITE_VERIFICATION.daumRobotsLine];
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
