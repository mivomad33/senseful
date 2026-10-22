import { Suspense } from "react";
import { connection } from "next/server";
import { getNext } from "./actions";
import { StudySession } from "./study-session";

async function Session({ searchParams }: { searchParams: PageProps<"/study">["searchParams"] }) {
  await connection();
  const ahead = (await searchParams).ahead === "1";
  return <StudySession initial={await getNext(ahead)} initialAhead={ahead} />;
}

/** ?ahead=1: 홈의 "기다리지 않고 바로 보기"로 들어옴 */
export default function StudyPage({ searchParams }: PageProps<"/study">) {
  return (
    <main className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-5 px-4 py-8">
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <Session searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
