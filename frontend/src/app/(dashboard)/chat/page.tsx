// Phase 4 Wave 3 — /chat route shell. On cold-start (?q=…) we create a
// new thread and bounce to /chat/{threadId}?q={q}; otherwise show the
// empty state with quick actions.
"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatThreadSidebar } from "@/components/chat/ChatThreadSidebar";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useCreateThread } from "@/hooks/useChatThreads";
import { Sparkles } from "lucide-react";

const QUICK_ACTIONS = [
  {
    label: "Today's brief",
    q: "Give me today's morning brief with yesterday's headline numbers and today's top 3 risks.",
  },
  {
    label: "Cash exposure",
    q: "What's our cash exposure across platforms this week?",
  },
  {
    label: "Top performers",
    q: "Who are the top 5 performers this week by completion rate and volume?",
  },
  {
    label: "Late drivers",
    q: "Which drivers were late or missed shifts today?",
  },
];

export default function ChatIndexPage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params?.get("q") ?? null;
  const create = useCreateThread();

  const startThread = async (content: string) => {
    const prompt = content.trim();
    if (!prompt || create.isPending) return;
    const { thread } = await create.mutateAsync(prompt);
    router.push(`/chat/${thread.id}?q=${encodeURIComponent(prompt)}`);
  };

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    (async () => {
      try {
        const { thread } = await create.mutateAsync(q);
        if (!cancelled) {
          router.replace(`/chat/${thread.id}?q=${encodeURIComponent(q)}`);
        }
      } catch {
        // Server unreachable — leave the user on the empty state with the
        // prompt preserved in the URL so they can retry.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[680px] overflow-hidden rounded-[18px] border border-black/[0.06] bg-white/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
      <ChatThreadSidebar />
      <div className="flex flex-1 flex-col">
        {q ? (
          <div className="flex flex-1 items-center justify-center text-secondary">
            <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> Starting your thread…
          </div>
        ) : (
          <>
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6">
              <Sparkles className="mb-4 h-14 w-14 text-sand-400" />
              <h1 className="mb-2 text-2xl font-semibold text-foreground">
                How can I help today?
              </h1>
              <p className="max-w-md text-center text-sm text-secondary">
                Drivers, cash, performance, and violations. Ask in plain language
                and I&apos;ll answer here.
              </p>
              <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => void startThread(a.q)}
                    className="rounded-2xl bg-card px-4 py-3 text-left text-sm ring-1 ring-sand-200 hover:bg-sand-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <ChatComposer
              onSend={(content) => void startThread(content)}
              isStreaming={create.isPending}
              placeholder="Ask Darb about drivers, cash, shifts, or risk"
            />
          </>
        )}
      </div>
    </div>
  );
}
