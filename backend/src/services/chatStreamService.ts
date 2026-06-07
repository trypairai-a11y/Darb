/**
 * Phase 4 Wave 2 — chatStreamService.
 *
 * Owns the SSE protocol for `GET /api/ai/chat/stream`:
 *   - per-thread Redis lock (T-04-W2-02 — prevents interleaved concurrent streams)
 *   - 15s heartbeat (T-04-W2-06 — defeats Vercel proxy 30s idle close)
 *   - cancel-via-Redis-flag (survives horizontal scale)
 *   - persistence orchestration (user msg + assistant placeholder + final row)
 *   - runAgent invocation with onTextDelta/onView/onPendingAction/onCancel
 *
 * Event protocol (SSE):
 *   event: thread        — first event, payload { threadId }
 *   event: queued        — assistant placeholder created, payload { msgId }
 *   event: text_delta    — per-token incremental text, payload { msgId, delta }
 *   event: view_block    — describeView output, payload { msgId, view }
 *   event: proposal      — registry staged a PendingAgentAction
 *   event: complete      — terminal success
 *   event: cancelled     — terminal cancel (client closed or cancel flag)
 *   event: error         — terminal failure
 *   :heartbeat\n\n       — comment-only line every 15s
 *
 * Locks survive across process boundaries when Redis is configured.
 * When Redis is unavailable (env.REDIS_URL=localhost or null) the lock
 * is a single-process Map — fine for dev, the Wave 5 migration assumes
 * Redis is live in production.
 */

import type { Response } from "express";
import { runAgent } from "../agent";
import * as chatHistoryService from "./chatHistoryService";
import redis from "../config/redis";
import { logger } from "../config/logger";
import { AGENT_MODEL } from "../agent/config";

const HEARTBEAT_MS_DEFAULT = 15_000;
const LOCK_TTL_MS_DEFAULT = 60_000;
const CANCEL_TTL_MS = 60_000;
const LOCK_PREFIX = "chat:lock:";
const CANCEL_PREFIX = "chat:cancel:";

// Test/override knob — `process.env.CHAT_HEARTBEAT_MS` lets the test suite
// shrink the heartbeat interval to a millisecond range for deterministic
// :heartbeat assertions.
function heartbeatInterval(): number {
  const v = Number.parseInt(String(process.env.CHAT_HEARTBEAT_MS ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : HEARTBEAT_MS_DEFAULT;
}

// In-process fallback lock store (when Redis is null — dev mode).
const inProcessLocks = new Map<string, number>();
const inProcessCancels = new Map<string, number>();

// ─── Lock ────────────────────────────────────────────────────────────────────

export interface ThreadLock {
  released(): Promise<void>;
}

export async function acquireThreadLock(
  threadId: string,
  ttlMs: number = LOCK_TTL_MS_DEFAULT,
): Promise<ThreadLock | null> {
  const key = LOCK_PREFIX + threadId;
  if (redis) {
    const ok = await redis.set(key, "1", "PX", ttlMs, "NX");
    if (!ok) return null;
    return {
      async released() {
        try {
          if (redis) await redis.del(key);
        } catch (err) {
          logger.warn({ err, key }, "chatStreamService: lock release failed");
        }
      },
    };
  }
  // Fallback: in-process map with expiry.
  const now = Date.now();
  const existing = inProcessLocks.get(key);
  if (existing && existing > now) return null;
  inProcessLocks.set(key, now + ttlMs);
  return {
    async released() {
      inProcessLocks.delete(key);
    },
  };
}

// ─── Cancel flag ─────────────────────────────────────────────────────────────

export async function cancelStream(messageId: string): Promise<void> {
  const key = CANCEL_PREFIX + messageId;
  if (redis) {
    await redis.set(key, "1", "PX", CANCEL_TTL_MS);
  } else {
    inProcessCancels.set(key, Date.now() + CANCEL_TTL_MS);
  }
}

async function isCancelled(messageId: string): Promise<boolean> {
  const key = CANCEL_PREFIX + messageId;
  if (redis) {
    return (await redis.exists(key)) === 1;
  }
  const exp = inProcessCancels.get(key);
  if (!exp) return false;
  if (exp <= Date.now()) {
    inProcessCancels.delete(key);
    return false;
  }
  return true;
}

async function clearCancelFlag(messageId: string): Promise<void> {
  const key = CANCEL_PREFIX + messageId;
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // swallow — TTL covers cleanup anyway
    }
  } else {
    inProcessCancels.delete(key);
  }
}

// ─── Stream ──────────────────────────────────────────────────────────────────

export interface StreamChatResult {
  threadId: string;
  assistantMessageId: string;
  status: "completed" | "failed" | "cancelled" | "disabled";
}

export async function streamChatToClient(opts: {
  tenantId: string;
  userId: string;
  threadId?: string;
  userMessage: string;
  res: Response;
}): Promise<StreamChatResult> {
  const { tenantId, userId, userMessage, res } = opts;

  // ── SSE headers ──
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  // Initial :ok comment so EventSource clients fire onopen immediately.
  res.write(`: ok\n\n`);

  const send = (eventType: string, data: unknown): void => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = (): void => {
    res.write(`:heartbeat\n\n`);
  };

  const hbTimer = setInterval(heartbeat, heartbeatInterval());

  let clientGone = false;
  const onClientClose = (): void => {
    clientGone = true;
  };
  // res.req is the Request; listen for HTTP disconnect
  res.req.on("close", onClientClose);

  let thread: { id: string; tenantId: string; userId: string; title: string };
  let placeholderId = "";
  let cancelPoller: NodeJS.Timeout | undefined;
  let lock: ThreadLock | null = null;

  try {
    // 1. Ensure thread exists, then capture prior turns before writing this
    // user message. runAgent receives the current message separately.
    thread = await chatHistoryService.upsertThread({
      tenantId,
      userId,
      threadId: opts.threadId,
      firstMessage: userMessage,
    });
    const history = await chatHistoryService.recentTurns(thread.id, tenantId, 20);
    await chatHistoryService.appendMessage({
      threadId: thread.id,
      tenantId,
      role: "user",
      content: userMessage,
      state: "complete",
    });
    send("thread", { threadId: thread.id });

    // 2. Create assistant placeholder.
    const placeholder = await chatHistoryService.appendMessage({
      threadId: thread.id,
      tenantId,
      role: "assistant",
      content: "",
      state: "queued",
    });
    placeholderId = placeholder.id;
    send("queued", { msgId: placeholder.id });

    // 3. Per-thread lock.
    lock = await acquireThreadLock(thread.id);
    if (!lock) {
      send("error", {
        msgId: placeholderId,
        error: "Another query is in flight for this thread; cancel it first.",
      });
      res.end();
      return {
        threadId: thread.id,
        assistantMessageId: placeholderId,
        status: "failed",
      };
    }

    // 4. Poll Redis cancel flag every 1s; runAgent's onCancel() returns sync.
    let cancelled = false;
    cancelPoller = setInterval(() => {
      void isCancelled(placeholderId).then((v) => {
        if (v) cancelled = true;
      });
    }, 1000);

    // 5. Run the chat agent with streaming hooks.
    const collectedViews: unknown[] = [];
    let textBuffer = "";
    let firstPendingActionId: string | undefined;

    const result = await runAgent("chat", {
      tenantId,
      triggerEvent: "route:chat:stream",
      userMessage,
      history,
      stream: {
        onTextDelta(delta) {
          textBuffer += delta;
          send("text_delta", { msgId: placeholderId, delta });
        },
        onView(view) {
          collectedViews.push(view);
          send("view_block", { msgId: placeholderId, view });
        },
        onPendingAction(pendingActionId) {
          if (!firstPendingActionId) firstPendingActionId = pendingActionId;
          send("proposal", { msgId: placeholderId, pendingActionId });
        },
        onCancel() {
          return clientGone || cancelled;
        },
      },
    });

    // 6. Replace the assistant placeholder with the final assistant state.
    if (result.status === "cancelled") {
      await chatHistoryService.updateMessage({
        id: placeholderId,
        tenantId,
        content: textBuffer,
        views: collectedViews as Record<string, unknown>[],
        state: "cancelled",
      });
      send("cancelled", { msgId: placeholderId });
    } else if (result.status === "completed") {
      await chatHistoryService.updateMessage({
        id: placeholderId,
        tenantId,
        content: result.text ?? textBuffer,
        views: (result.views ?? collectedViews) as Record<string, unknown>[],
        toolCalls: [],
        proposalId: firstPendingActionId,
        state: "complete",
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        modelName: AGENT_MODEL,
      });
      send("complete", {
        msgId: placeholderId,
        finalMessageId: placeholderId,
        runId: result.runId,
        meta: {
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          modelName: AGENT_MODEL,
        },
      });
    } else if (result.status === "disabled") {
      // Agent disabled (no ANTHROPIC_API_KEY) — persist a visible assistant
      // turn so the UI doesn't hang waiting for a complete event.
      await chatHistoryService.updateMessage({
        id: placeholderId,
        tenantId,
        content:
          "Anthropic is not connected yet. Add ANTHROPIC_API_KEY to backend/.env, restart the backend, then ask again.",
        state: "complete",
        modelName: AGENT_MODEL,
      });
      send("complete", {
        msgId: placeholderId,
        finalMessageId: placeholderId,
        runId: result.runId,
        meta: { disabled: true },
      });
    } else {
      // failed
      await chatHistoryService.updateMessage({
        id: placeholderId,
        tenantId,
        content: textBuffer,
        state: "error",
        errorMessage: result.error ?? "Agent failed",
        modelName: AGENT_MODEL,
      });
      send("error", {
        msgId: placeholderId,
        error: result.error ?? "Agent failed",
      });
    }

    res.end();
    return {
      threadId: thread.id,
      assistantMessageId: placeholderId,
      status: result.status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "chatStreamService: stream failed");
    send("error", { msgId: placeholderId || undefined, error: msg });
    try {
      res.end();
    } catch {
      // ignore double-end
    }
    return {
      threadId: (typeof thread! !== "undefined" ? thread!.id : "") as string,
      assistantMessageId: placeholderId,
      status: "failed",
    };
  } finally {
    clearInterval(hbTimer);
    if (cancelPoller) clearInterval(cancelPoller);
    res.req.removeListener("close", onClientClose);
    if (lock) {
      await lock.released();
    }
    if (placeholderId) {
      await clearCancelFlag(placeholderId);
    }
  }
}
