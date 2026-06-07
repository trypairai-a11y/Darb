// Phase 4 Wave 3 — left sidebar listing chat threads (UI-SPEC §3.2.2).
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChatThreads, useCreateThread } from "@/hooks/useChatThreads";
import { Plus, Search, MessageSquare, Pin } from "lucide-react";
import type { ChatThread } from "@/types/chat";

interface ChatThreadSidebarProps {
  activeThreadId?: string;
}

function groupThreads(threads: ChatThread[]): {
  today: ChatThread[];
  yesterday: ChatThread[];
  thisWeek: ChatThread[];
  older: ChatThread[];
} {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfDay - 86_400_000;
  const startOfWeek = startOfDay - 7 * 86_400_000;
  const today: ChatThread[] = [];
  const yesterday: ChatThread[] = [];
  const thisWeek: ChatThread[] = [];
  const older: ChatThread[] = [];
  for (const t of threads) {
    const ts = new Date(t.lastMessageAt).getTime();
    if (ts >= startOfDay) today.push(t);
    else if (ts >= startOfYesterday) yesterday.push(t);
    else if (ts >= startOfWeek) thisWeek.push(t);
    else older.push(t);
  }
  return { today, yesterday, thisWeek, older };
}

function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: ChatThread;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
        active
          ? "border-l-2 border-primary bg-primary/5 text-foreground"
          : "border-l-2 border-transparent hover:bg-sand-50"
      }`}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-secondary" />
      <span className="flex-1 truncate">{thread.title}</span>
      {thread.pinned && <Pin className="h-3 w-3 text-primary" />}
    </button>
  );
}

export function ChatThreadSidebar({ activeThreadId }: ChatThreadSidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data } = useChatThreads({ search: search.trim() || undefined });
  const create = useCreateThread();

  const groups = groupThreads(data?.threads ?? []);

  const onNew = async () => {
    try {
      const { thread } = await create.mutateAsync(undefined);
      router.push(`/chat/${thread.id}`);
    } catch {
      router.push("/chat");
    }
  };

  return (
    <aside className="hidden h-full w-[280px] shrink-0 flex-col border-r border-sand-200 bg-white/70 xl:flex">
      <div className="flex items-center gap-2 border-b border-sand-200 px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-foreground px-3 py-1.5 text-xs font-medium text-white hover:bg-foreground/90"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>
      <div className="border-b border-sand-200 px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-sand-50 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-secondary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads"
            className="w-full bg-transparent text-sm placeholder:text-secondary focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {(["today", "yesterday", "thisWeek", "older"] as const).map((g) => {
          const list = groups[g];
          if (!list.length) return null;
          const labels: Record<typeof g, string> = {
            today: "Today",
            yesterday: "Yesterday",
            thisWeek: "This week",
            older: "Older",
          };
          return (
            <div key={g} className="mb-2">
              <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-secondary">
                {labels[g]}
              </div>
              {list.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === activeThreadId}
                  onClick={() => router.push(`/chat/${t.id}`)}
                />
              ))}
            </div>
          );
        })}
        {!data?.threads?.length && (
          <div className="px-3 py-6 text-center text-xs text-secondary">
            No threads yet. Start by asking a question.
          </div>
        )}
      </div>
    </aside>
  );
}

export default ChatThreadSidebar;
