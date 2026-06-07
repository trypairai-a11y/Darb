// Phase 4 Wave 3 — assistant message bubble (UI-SPEC §3.2.3).
// Renders text content, generated viewBlocks, the optional inline
// ChatActionCard (proposalId), and the tool-call footer.
"use client";
import type { ChatMessage, GeneratedView, ToolCallRecord, StreamingState } from "@/types/chat";
import { ChatViewRenderer } from "./ChatViewRenderer";
import { ChatActionCard } from "./ChatActionCard";
import { ToolCallChip } from "./ToolCallChip";
import { StreamingIndicator } from "./StreamingIndicator";

interface AssistantMessageBubbleProps {
  message: ChatMessage;
  streaming?: StreamingState;
  /** Visible text overriding the persisted content while streaming. */
  streamingText?: string;
  /** Newly-streamed views not yet persisted into message.views. */
  streamingViews?: GeneratedView[];
  /** Streaming proposalId (will be set on message.proposalId once complete). */
  streamingProposalId?: string;
  /** Live tool-call records for in-flight runs. */
  streamingToolCalls?: ToolCallRecord[];
  threadId?: string;
  onFollowUp?: (prompt: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function cleanAssistantText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s+[—–]\s+/g, ": ")
    .replace(/[—–]/g, "-")
    .replace(/(^|\s)\*\*([^*\n]+)\*\*/g, "$1$2")
    .replace(/(^|\s)__([^_\n]+)__/g, "$1$2")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*/g, "")
    .replace(/^\s*>\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function AssistantMessageBubble({
  message,
  streaming,
  streamingText,
  streamingViews,
  streamingProposalId,
  streamingToolCalls,
  threadId,
  onFollowUp,
}: AssistantMessageBubbleProps) {
  const rawContent = streamingText !== undefined ? streamingText : message.content;
  const content = cleanAssistantText(rawContent);
  const views = [...(message.views ?? []), ...(streamingViews ?? [])];
  const toolCalls = [...(message.toolCalls ?? []), ...(streamingToolCalls ?? [])];
  const proposalId = message.proposalId ?? streamingProposalId;
  const isStreaming = streaming && streaming.phase !== "complete" && streaming.phase !== "idle";

  return (
    <div className="mb-4 flex justify-start">
      <div className="max-w-[92%] flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-card px-5 py-4 ring-1 ring-sand-200">
          {/* Streaming indicator while no text yet */}
          {isStreaming && !content && streaming && (
            <StreamingIndicator state={streaming} />
          )}
          {content && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {content}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/50" />
              )}
            </div>
          )}
          {views.length > 0 && (
            <div className="mt-3">
              {views.map((v) => (
                <ChatViewRenderer
                  key={v.id}
                  view={v}
                  threadId={threadId}
                  messageId={message.id}
                  onFollowUp={onFollowUp}
                />
              ))}
            </div>
          )}
          {proposalId && (
            <div className="mt-3">
              <ChatActionCard
                proposal={{ pendingActionId: proposalId, threadId, msgId: message.id }}
              />
            </div>
          )}
        </div>
        {(toolCalls.length > 0 || message.latencyMs > 0) && (
          <div className="ml-1 mt-1 flex flex-wrap items-center gap-2 text-[11px] text-sand-500">
            {toolCalls.map((c) => (
              <ToolCallChip key={c.id} call={c} />
            ))}
            {message.latencyMs > 0 && (
              <span>
                {formatTime(message.createdAt)} · {message.latencyMs}ms ·{" "}
                {message.promptTokens + message.completionTokens} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssistantMessageBubble;
