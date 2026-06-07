// Phase 4 Wave 3 — center pane: header + message list + composer.
// Wires useStreamingChat events into local state and the chat message
// React Query cache.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  GeneratedView,
  ToolCallRecord,
  StreamingState,
} from "@/types/chat";
import { useChatThread, usePatchThread } from "@/hooks/useChatThreads";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { Pin, PinOff } from "lucide-react";

interface ChatThreadPaneProps {
  threadId: string;
  initialPrompt?: string;
}

export function ChatThreadPane({ threadId, initialPrompt }: ChatThreadPaneProps) {
  const qc = useQueryClient();
  const { data, refetch } = useChatThread(threadId);
  const patch = usePatchThread();
  const [streamingText, setStreamingText] = useState<string>("");
  const [streamingViews, setStreamingViews] = useState<GeneratedView[]>([]);
  const [streamingProposalId, setStreamingProposalId] = useState<string | undefined>();
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallRecord[]>([]);
  const [streamingState, setStreamingState] = useState<StreamingState>({ phase: "idle" });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const consumedInitial = useRef(false);

  const resetStreamingBuffers = () => {
    setStreamingText("");
    setStreamingViews([]);
    setStreamingProposalId(undefined);
    setStreamingToolCalls([]);
  };

  const stream = useStreamingChat({
    threadId,
    onTextDelta: (delta) => {
      setStreamingState((s) => ({ ...s, phase: "streaming_text" }));
      setStreamingText((t) => t + delta);
    },
    onViewBlock: (view) => {
      setStreamingState((s) => ({ ...s, phase: "streaming_view" }));
      setStreamingViews((v) => [...v, view]);
    },
    onProposal: (pendingActionId) => {
      setStreamingProposalId(pendingActionId);
    },
    onToolStart: ({ toolName, toolCallId }) => {
      setStreamingState({ phase: "tool_running", toolName });
      setStreamingToolCalls((calls) => [
        ...calls,
        {
          id: toolCallId ?? `tc-${Date.now()}`,
          toolName,
          input: {},
          state: "running",
        },
      ]);
    },
    onToolComplete: ({ toolCallId, latencyMs }) => {
      setStreamingToolCalls((calls) =>
        calls.map((c) =>
          c.id === toolCallId ? { ...c, state: "success", latencyMs } : c,
        ),
      );
    },
    onQueued: (msgId) => {
      setStreamingState({ phase: "queued", msgId });
      void refetch();
    },
    onComplete: () => {
      setStreamingState({ phase: "complete" });
      resetStreamingBuffers();
      void refetch();
      void qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onCancelled: () => {
      setStreamingState({ phase: "cancelled" });
      resetStreamingBuffers();
      void refetch();
    },
    onError: (err) => {
      setStreamingState({ phase: "error", errorMessage: err });
      void refetch();
    },
  });

  // Cold-start: if an initialPrompt arrived via the route, send it once.
  useEffect(() => {
    if (consumedInitial.current) return;
    if (!initialPrompt || !threadId) return;
    consumedInitial.current = true;
    void send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, threadId]);

  const send = async (content: string) => {
    setStreamingState({ phase: "queued" });
    resetStreamingBuffers();
    await stream.sendMessage(content);
  };

  const onCancel = () => {
    stream.abort();
  };

  const thread = data?.thread;
  const messages: ChatMessage[] = useMemo(() => data?.messages ?? [], [data]);

  const onTitleSave = async () => {
    if (!thread) return;
    const newTitle = titleDraft.trim();
    if (newTitle && newTitle !== thread.title) {
      await patch.mutateAsync({ id: thread.id, patch: { title: newTitle } });
    }
    setEditingTitle(false);
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-transparent">
      <header className="flex items-center justify-between border-b border-sand-200 px-6 py-3">
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTitleSave();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            autoFocus
            className="flex-1 rounded-md border border-sand-200 bg-card px-2 py-1 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(thread?.title ?? "");
              setEditingTitle(true);
            }}
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            {thread?.title ?? "New chat"}
          </button>
        )}
        {thread && (
          <button
            type="button"
            onClick={() =>
              patch.mutate({ id: thread.id, patch: { pinned: !thread.pinned } })
            }
            className="rounded-md p-1 text-secondary hover:bg-sand-50"
            aria-label={thread.pinned ? "Unpin thread" : "Pin thread"}
          >
            {thread.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        )}
      </header>

      <ChatMessageList
        messages={messages}
        streaming={streamingState}
        streamingText={streamingText}
        streamingViews={streamingViews}
        streamingProposalId={streamingProposalId}
        streamingToolCalls={streamingToolCalls}
        threadId={threadId}
        onFollowUp={(prompt) => void send(prompt)}
      />

      <ChatComposer
        onSend={(c) => void send(c)}
        onCancel={onCancel}
        isStreaming={stream.isStreaming || streamingState.phase === "queued"}
      />
    </div>
  );
}

export default ChatThreadPane;
