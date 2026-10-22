import Link from "next/link";
import { REPO_URL } from "@/config";
import { FEEDBACK_MAILTO } from "@/lib/links";

/** 모든 화면 맨 아래의 작은 연한 글자 푸터. 의견 보내기, 개인정보 처리방침, GitHub 저장소 */
export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-[13px] text-hint [&_a]:underline ${className}`}>
      Senseful · <a href={FEEDBACK_MAILTO}>의견 보내기</a> · <Link href="/privacy">개인정보 처리방침</Link> · <a href={REPO_URL}>GitHub</a>
    </footer>
  );
}
