// Phase 4 Wave 3 — EventSource lifecycle for /api/ai/chat/stream.
// One hook instance per ChatThreadPane. Reconnects on error with
// exponential backoff (1s, 2s, 4s, max 30s) capped at 3 attempts;
// surfaces fatal errors via onError callback.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedView } from "@/types/chat";
import { getAccessToken } from "@/lib/api";

export interface UseStreamingChatOpts {
  threadId?: string;
  onTextDelta?: (delta: string) => void;
  onViewBlock?: (view: GeneratedView) => void;
  onProposal?: (pendingActionId: string) => void;
  onToolStart?: (info: { toolName: string; toolCallId?: string }) => void;
  onToolComplete?: (info: { toolName: string; toolCallId?: string; latencyMs?: number }) => void;
  onComplete?: (meta: {
    msgId?: string;
    finalMessageId?: string;
    runId?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
  }) => void;
  onCancelled?: () => void;
  onError?: (error: string) => void;
  onThread?: (threadId: string) => void;
  onQueued?: (msgId: string) => void;
}

export interface UseStreamingChatReturn {
  isConnected: boolean;
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  abort: () => void;
  retry: () => void;
}

const MAX_RETRIES = 3;

function safeParse<T = unknown>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useStreamingChat(opts: UseStreamingChatOpts): UseStreamingChatReturn {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [isConnected, setConnected] = useState(false);
  const [isStreaming, setStreaming] = useState(false);

  const sourceRef = useRef<EventSource | null>(null);
  const lastMessageRef = useRef<string>("");
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const abort = useCallback(() => {
    cleanupTimer();
    if (sourceRef.current) {
      try {
        sourceRef.current.close();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    setStreaming(false);
    setConnected(false);
  }, []);

  const openStream = useCallback((content: string) => {
    if (typeof window === "undefined") return;
    if (!content?.trim()) return;
    // Close any prior connection cleanly before opening a new one.
    if (sourceRef.current) {
      try {
        sourceRef.current.close();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    lastMessageRef.current = content;

    const params = new URLSearchParams();
    if (optsRef.current.threadId) params.set("threadId", optsRef.current.threadId);
    params.set("q", content);
    const token = getAccessToken();
    if (token) params.set("token", token);
    const url = `/api/ai/chat/stream?${params.toString()}`;

    const src = new EventSource(url, { withCredentials: true });
    sourceRef.current = src;
    setStreaming(true);

    const on = (type: string, handler: (e: MessageEvent) => void) =>
      src.addEventListener(type, handler as EventListener);

    on("open", () => {
      setConnected(true);
      retryCountRef.current = 0;
    });

    on("thread", (e: MessageEvent) => {
      const d = safeParse<{ threadId?: string }>(e.data);
      if (d?.threadId) optsRef.current.onThread?.(d.threadId);
    });

    on("queued", (e: MessageEvent) => {
      const d = safeParse<{ msgId?: string }>(e.data);
      if (d?.msgId) optsRef.current.onQueued?.(d.msgId);
    });

    on("tool_start", (e: MessageEvent) => {
      const d = safeParse<{ toolName: string; toolCallId?: string }>(e.data);
      if (d?.toolName) optsRef.current.onToolStart?.(d);
    });

    on("tool_complete", (e: MessageEvent) => {
      const d = safeParse<{ toolName: string; toolCallId?: string; latencyMs?: number }>(e.data);
      if (d?.toolName) optsRef.current.onToolComplete?.(d);
    });

    on("text_delta", (e: MessageEvent) => {
      const d = safeParse<{ delta?: string }>(e.data);
      if (d && typeof d.delta === "string") optsRef.current.onTextDelta?.(d.delta);
    });

    on("view_block", (e: MessageEvent) => {
      const d = safeParse<{ view?: GeneratedView }>(e.data);
      if (d?.view) optsRef.current.onViewBlock?.(d.view);
    });

    on("proposal", (e: MessageEvent) => {
      const d = safeParse<{ pendingActionId?: string }>(e.data);
      if (d?.pendingActionId) optsRef.current.onProposal?.(d.pendingActionId);
    });

    on("complete", (e: MessageEvent) => {
      const d = safeParse<Record<string, unknown>>(e.data) ?? {};
      optsRef.current.onComplete?.((d.meta as never) ?? (d as never));
      setStreaming(false);
      try {
        src.close();
      } catch {
        /* noop */
      }
      if (sourceRef.current === src) sourceRef.current = null;
    });

    on("cancelled", () => {
      optsRef.current.onCancelled?.();
      setStreaming(false);
      try {
        src.close();
      } catch {
        /* noop */
      }
      if (sourceRef.current === src) sourceRef.current = null;
    });

    on("error", (e: MessageEvent) => {
      // Three cases:
      //   (a) server sent `event: error` with payload (treat as fatal)
      //   (b) transport-level error mid-stream — reconnect with backoff
      //   (c) clean close (closed by server) — just end
      const payload = safeParse<{ error?: string }>(e.data);
      if (payload?.error) {
        optsRef.current.onError?.(payload.error);
        setStreaming(false);
        try {
          src.close();
        } catch {
          /* noop */
        }
        if (sourceRef.current === src) sourceRef.current = null;
        return;
      }

      // Transport-level — close current and (maybe) reconnect.
      try {
        src.close();
      } catch {
        /* noop */
      }
      if (sourceRef.current === src) sourceRef.current = null;

      if (retryCountRef.current >= MAX_RETRIES) {
        optsRef.current.onError?.("connection lost");
        setStreaming(false);
        return;
      }
      const attempt = retryCountRef.current;
      // Backoff: 100ms → 1s → 2s → 4s → max 30s. The first retry is
      // intentionally near-zero so a transient disconnect (the common
      // case under Vercel's 30s idle close) self-heals in under a tick.
      const delay =
        attempt === 0 ? 100 : Math.min(30_000, 1_000 * Math.pow(2, attempt - 1));
      retryCountRef.current = attempt + 1;
      cleanupTimer();
      retryTimerRef.current = setTimeout(() => {
        if (lastMessageRef.current) openStream(lastMessageRef.current);
      }, delay);
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      retryCountRef.current = 0;
      openStream(content);
    },
    [openStream],
  );

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    if (lastMessageRef.current) openStream(lastMessageRef.current);
  }, [openStream]);

  useEffect(() => {
    return () => {
      cleanupTimer();
      if (sourceRef.current) {
        try {
          sourceRef.current.close();
        } catch {
          /* noop */
        }
        sourceRef.current = null;
      }
    };
  }, []);

  return { isConnected, isStreaming, sendMessage, abort, retry };
}

export default useStreamingChat;
