import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { requireUser } from "@/lib/auth/current";
import { getNext } from "./actions";
import { StudySession } from "./study-session";

async function Session({ searchParams }: { searchParams: PageProps<"/study">["searchParams"] }) {
  const u = await requireUser();
  const ahead = (await searchParams).ahead === "1";
  return <StudySession initial={await getNext(ahead)} initialAhead={ahead} isAdmin={u.isAdmin} />;
}

/** ?ahead=1: 홈의 "기다리지 않고 바로 보기"로 들어옴 */
export default function StudyPage({ searchParams }: PageProps<"/study">) {
  return (
    <main className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-5 px-4 py-6 sm:py-8">
      <Suspense fallback={<Loading card />}>
        <Session searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
