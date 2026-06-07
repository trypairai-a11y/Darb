// Phase 4 Wave 3 — /chat/[threadId] permalink. Replays history and
// (if `?q=` is present from cold-start) auto-sends the initial prompt.
"use client";
import { useParams, useSearchParams } from "next/navigation";
import { ChatThreadSidebar } from "@/components/chat/ChatThreadSidebar";
import { ChatThreadPane } from "@/components/chat/ChatThreadPane";

export default function ChatThreadPage() {
  const params = useParams();
  const search = useSearchParams();
  const threadId = (params?.threadId as string | undefined) ?? "";
  const initialPrompt = search?.get("q") ?? undefined;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[680px] overflow-hidden rounded-[18px] border border-black/[0.06] bg-white/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
      <ChatThreadSidebar activeThreadId={threadId} />
      <ChatThreadPane threadId={threadId} initialPrompt={initialPrompt} />
    </div>
  );
}
