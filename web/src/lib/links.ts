// 개발자에게 메일 보내기 링크(의견 보내기, 정식 버전 졸라 주기). 주소는 같고 제목만 다르다.
import { CONTACT_EMAIL } from "@/config";

const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

export const FEEDBACK_MAILTO = mailto("Senseful 의견");
export const NAG_MAILTO = mailto("Senseful 정식 버전 만들어 주세요");
