import { NAG_MAILTO } from "@/lib/links";

/** 정식 버전을 만들어 달라고 개발자를 졸라 달라는 한 줄과 메일 링크(사용자가 정한 문구) */
function Nag() {
  return (
    <p>
      더 공부하고 싶으시다면, 정식 버전을 만들어 달라고 개발자를 졸라 주세요.{" "}
      <a href={NAG_MAILTO} className="font-bold text-link underline-offset-[3px] hover:underline">
        개발자에게 조르기
      </a>
    </p>
  );
}

const box = "flex flex-col gap-1.5 rounded-[14px] bg-violet-soft px-4 py-3.5 text-sm leading-relaxed text-violet-ink";

/** 학습할 새 카드가 하나도 남지 않았을 때(문서 4.2-3) */
export function NoNewCardsNotice() {
  return (
    <div role="status" className={box}>
      <p className="font-bold">새 카드를 준비하고 있습니다.</p>
      <Nag />
    </div>
  );
}

/** 판정 한도에 걸렸을 때(문서 4.4-1). scope: 사용자 한도 또는 전체 한도. 숫자는 서버의 설정값을 받는다. */
export function GradeLimitNotice({ scope, perUser, dayStartHour }: { scope: "user" | "total"; perUser: number; dayStartHour: number }) {
  return (
    <div role="alert" className={box}>
      {scope === "user" ? (
        <p className="font-bold">오늘 판정을 모두 쓰셨습니다. Senseful은 아직 베타라 하루 {perUser}번까지만 판정해 드릴 수 있습니다.</p>
      ) : (
        <p className="font-bold">
          오늘은 Senseful 전체 판정 한도에 도달했습니다. 내일 새벽 {dayStartHour}시부터 다시 판정할 수 있습니다.
        </p>
      )}
      <Nag />
    </div>
  );
}
