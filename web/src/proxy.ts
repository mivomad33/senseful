// 로그인 쿠키만 보고 빠르게 길을 나눈다(DB는 보지 않는다). 실제 세션 확인은 각 화면과 서버 동작이 한다.
// - 소개 화면(/)에 쿠키가 있으면 홈으로 보낸다. 소개 화면은 정적 페이지로 두고 여기서만 갈라 준다.
// - 로그인이 필요한 화면에 쿠키가 없으면 소개 화면으로 보낸다.
// - API(로그인 경로 제외)에 쿠키가 없으면 401이다.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "senseful_session";
const APP_PATHS = ["/home", "/study", "/settings", "/admin"];

export function proxy(req: NextRequest) {
  const has = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;
  if (pathname === "/") return has ? NextResponse.redirect(new URL("/home", req.url)) : NextResponse.next();
  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/") || has) return NextResponse.next();
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!has && APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/:path*", "/home/:path*", "/study/:path*", "/settings/:path*", "/admin/:path*"],
};
