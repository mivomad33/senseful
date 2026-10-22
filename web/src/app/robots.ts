import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config";

// 소개 화면과 개인정보 처리방침만 수집한다. 로그인 뒤의 화면, 인증 경로, API는 막는다(문서 4.5-10).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/home", "/study", "/settings", "/admin", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
