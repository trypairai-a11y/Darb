/**
 * Phase 4 Wave 2 — Chat router.
 *
 * Two logical surfaces sharing the same Express router:
 *   1. SSE chat stream   GET /api/ai/chat/stream
 *   2. Thread + message CRUD   /api/chat/{threads,messages,…}
 *
 * Both surfaces require authMiddleware + tenantScope. The CRUD operations
 * additionally scope by req.user.userId so a foreign user inside the same
 * tenant cannot read or mutate threads they don't own (T-04-W2-01, T-04-W2-03).
 *
 * The chat-resident propose-and-confirm flow reuses the existing
 * `/api/decisions/:id/approve` endpoint (Phase 2). Chat clients POST that
 * endpoint with `{ source: "chat", threadId, msgId }`; this router does NOT
 * own the approval write — decisions.ts does. See decisions.ts for the
 * additive `source`/`chatThreadId`/`chatMessageId` AgentAction column write.
 *
 * REQ-chat-global-access, REQ-chat-generated-dashboards, REQ-chat-action-proposals,
 * REQ-agent-natural-language-qa, REQ-realtime-streaming.
 */

import { Router, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore, { type RedisReply } from "rate-limit-redis";
import { prisma } from "../config";
import redis from "../config/redis";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import {
  streamChatToClient,
  cancelStream,
} from "../services/chatStreamService";
import { searchChatHistory } from "../services/chatHistoryService";
import { logger } from "../config/logger";

const router = Router();

// ─── Rate limit (T-04-W2-07) ─────────────────────────────────────────────────
// 60 requests/min/user on the SSE stream — Anthropic quota guard.
function makeChatStore(): import("express-rate-limit").Store | undefined {
  if (!redis) return undefined;
  return new RedisStore({
    prefix: "rl:chat:",
    sendCommand: (...args: string[]) =>
      (redis as any).call(...args) as Promise<RedisReply>,
  });
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Chat rate limit exceeded. Slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    return userId ? `u:${userId}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  store: makeChatStore(),
});

// All chat routes require auth + tenant context.
router.use(authMiddleware, tenantScope);

// ─── SSE stream ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ai/chat/stream:
 *   get:
 *     tags: [Chat]
 *     summary: Server-Sent Events stream for chat agent run.
 *     description: |
 *       Opens an SSE connection that emits:
 *         thread → queued → text_delta+ → view_block? → proposal? → complete
 *       Heartbeats `:heartbeat\n\n` keep the connection alive past Vercel's
 *       30s proxy timeout.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: User message
 *       - in: query
 *         name: threadId
 *         schema: { type: string }
 *         description: Optional existing thread to continue
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 *       400:
 *         description: q missing
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: threadId provided but not in tenant+user scope
 */
router.get("/stream", chatLimiter, async (req: Request, res: Response) => {
  const userId = (req.user as { userId: string }).userId;
  const tenantId = req.user!.tenantId;
  const threadId = (req.query.threadId as string | undefined) || undefined;
  const userMessage = String(req.query.q ?? "").trim();

  if (!userMessage) {
    res.status(400).json({ error: "q (user message) required" });
    return;
  }

  // Pre-flight tenant+user scope check on threadId (T-04-W2-01 mitigation).
  if (threadId) {
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, tenantId, userId },
      select: { id: true },
    });
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
  }

  try {
    await streamChatToClient({ tenantId, userId, threadId, userMessage, res });
  } catch (err) {
    logger.error({ err }, "chat /stream handler caught");
    // streamChatToClient already wrote SSE-style error events; safe to no-op.
  }
});

router.post(
  "/messages/:messageId/cancel",
  async (req: Request, res: Response) => {
    const messageId = req.params.messageId;
    const tenantId = req.user!.tenantId;
    const userId = (req.user as { userId: string }).userId;
    // Verify the message belongs to the caller before honouring cancel —
    // otherwise any authenticated user could cancel anyone's stream.
    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, tenantId },
      select: { id: true, threadId: true },
    });
    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    const thread = await prisma.chatThread.findFirst({
      where: { id: msg.threadId, tenantId, userId },
      select: { id: true },
    });
    if (!thread) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    await cancelStream(messageId);
    res.json({ ok: true });
  },
);

// ─── Threads CRUD ────────────────────────────────────────────────────────────

router.post("/threads", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const { initialMessage, title } = (req.body ?? {}) as {
      initialMessage?: string;
      title?: string;
    };
    const computedTitle =
      (title ?? initialMessage ?? "New chat").trim().slice(0, 200) || "New chat";
    const thread = await prisma.chatThread.create({
      data: { tenantId, userId, title: computedTitle },
    });
    res.json({ thread });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/threads", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const search = (req.query.q ?? req.query.search) as string | undefined;
    const page = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? 1), 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? 25), 10) || 25),
    );

    if (search && search.trim().length >= 2) {
      const matches = await searchChatHistory({
        tenantId,
        userId,
        q: search.trim(),
        limit,
      });
      res.json({
        threads: [],
        grouped: { today: [], yesterday: [], thisWeek: [], older: [] },
        pagination: { page: 1, limit, total: matches.length, totalPages: 1 },
        search: { matches },
      });
      return;
    }

    const where = { tenantId, userId, archivedAt: null };
    const [threads, total] = await Promise.all([
      prisma.chatThread.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.chatThread.count({ where }),
    ]);

    res.json({
      threads,
      grouped: groupByRecency(threads),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/threads/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const thread = await prisma.chatThread.findFirst({
      where: { id: req.params.id, tenantId, userId },
    });
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const messages = await prisma.chatMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    res.json({
      thread,
      messages,
      hasMoreMessages: messages.length === 50,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/threads/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const { title, pinned } = (req.body ?? {}) as {
      title?: string;
      pinned?: boolean;
    };
    const data: { title?: string; pinned?: boolean } = {};
    if (typeof title === "string") data.title = title.slice(0, 200);
    if (typeof pinned === "boolean") data.pinned = pinned;

    const updated = await prisma.chatThread.updateMany({
      where: { id: req.params.id, tenantId, userId },
      data,
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const thread = await prisma.chatThread.findFirst({
      where: { id: req.params.id, tenantId, userId },
    });
    res.json({ thread });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/threads/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const updated = await prisma.chatThread.updateMany({
      where: {
        id: req.params.id,
        tenantId,
        userId,
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/threads/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const tenantId = req.user!.tenantId;
    const content = String(req.body?.content ?? "").trim();
    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }
    const thread = await prisma.chatThread.findFirst({
      where: { id: req.params.id, tenantId, userId },
    });
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const userMsg = await prisma.chatMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        role: "user",
        content,
        state: "complete",
      },
    });
    const placeholder = await prisma.chatMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        role: "assistant",
        content: "",
        state: "queued",
      },
    });
    await prisma.chatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });
    res.json({
      userMessage: userMsg,
      assistantMessageId: placeholder.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/messages/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = (req.user as { userId: string }).userId;
    const msg = await prisma.chatMessage.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    // Enforce user scope through parent thread.
    const thread = await prisma.chatThread.findFirst({
      where: { id: msg.threadId, tenantId, userId },
      select: { id: true },
    });
    if (!thread) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message: msg });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

interface ThreadWithLastMsgAt {
  lastMessageAt: Date;
  [k: string]: unknown;
}

function groupByRecency<T extends ThreadWithLastMsgAt>(threads: T[]): {
  today: T[];
  yesterday: T[];
  thisWeek: T[];
  older: T[];
} {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const out = {
    today: [] as T[],
    yesterday: [] as T[],
    thisWeek: [] as T[],
    older: [] as T[],
  };
  for (const t of threads) {
    const ts = t.lastMessageAt;
    if (sameDay(ts, now)) out.today.push(t);
    else if (sameDay(ts, yesterday)) out.yesterday.push(t);
    else if (ts > weekAgo) out.thisWeek.push(t);
    else out.older.push(t);
  }
  return out;
}

export default router;
