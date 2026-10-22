// 검색엔진·링크 미리보기용 페이지 정보(문서 4.5-9, 4.5-10). 절대 주소는 운영 주소 기준이다.
import type { Metadata } from "next";
import { SITE_URL } from "@/config";

export const DESCRIPTION = "영단어를 뜻 하나씩 예문 번역으로 익히는 학습 앱입니다. 예문을 번역하면 AI가 맞았는지 판정하고, 복습 날짜는 알아서 잡아 드립니다.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Senseful 소개 이미지: 예문을 번역하면 AI가 맞았는지 판정하는 학습 카드" };

/** 링크 미리보기. 하위 페이지가 openGraph를 정하면 통째로 바뀌므로(얕은 병합) 페이지마다 전체를 만든다. */
export function openGraph(path: string): Metadata["openGraph"] {
  return { title: "Senseful", description: DESCRIPTION, url: path, siteName: "Senseful", locale: "ko_KR", type: "website", images: [OG_IMAGE] };
}

/** 검색엔진에 보일 공개 페이지(소개, 개인정보 처리방침)의 정보: 제목, 설명, canonical, 링크 미리보기 */
export function publicPage(path: string, title: string): Metadata {
  return { title, description: DESCRIPTION, alternates: { canonical: path }, openGraph: openGraph(path) };
}

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Senseful",
  description: DESCRIPTION,
  openGraph: openGraph("/"),
  twitter: { card: "summary_large_image", title: "Senseful", description: DESCRIPTION, images: [OG_IMAGE] },
};
