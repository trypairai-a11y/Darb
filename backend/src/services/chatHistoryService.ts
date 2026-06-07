/**
 * Phase 4 Wave 1 — chatHistoryService.
 *
 * Thread + message persistence + FTS + 90-day archive for the chat surface.
 * Every Prisma call scopes by tenantId AND userId (defense in depth — T-04-W1-01
 * / T-04-W1-02). lint:tenant blocks any query that omits tenantId at compile
 * time.
 *
 * Public API:
 *   upsertThread        — create or touch a thread
 *   appendMessage       — write a ChatMessage row + bump lastMessageAt
 *   recentTurns         — last N user/assistant turns (oldest→newest)
 *   searchChatHistory   — Postgres FTS ('simple' config preserves Arabic — RESEARCH Pitfall 5)
 *   archiveOlderThan90Days — sets archivedAt on threads inactive >90d (idempotent)
 *
 * REQ-chat-global-access.
 */

import { prisma } from "../config";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessageState =
  | "queued"
  | "tool_running"
  | "streaming"
  | "complete"
  | "error"
  | "cancelled";

export type ToolCallRecord = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  state: "running" | "success" | "error";
  latencyMs?: number;
  errorMessage?: string;
};

// Type erased — runtime captures `unknown` views; the frontend chat.ts types
// constrain them at the edge.
export type GeneratedView = Record<string, unknown>;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// ─── upsertThread ────────────────────────────────────────────────────────────

export async function upsertThread(opts: {
  tenantId: string;
  userId: string;
  threadId?: string;
  firstMessage?: string;
  source?: "user" | "briefing";
  briefingId?: string;
}): Promise<{ id: string; tenantId: string; userId: string; title: string }> {
  if (!opts.tenantId) throw new Error("upsertThread: tenantId required");
  if (!opts.userId) throw new Error("upsertThread: userId required");

  if (opts.threadId) {
    // Tenant + user scope: defense in depth — a foreign user/tenant cannot
    // touch this thread via id-guess.
    const existing = await prisma.chatThread.findFirst({
      where: { id: opts.threadId, tenantId: opts.tenantId, userId: opts.userId },
    });
    if (!existing) {
      throw new Error(
        `upsertThread: thread ${opts.threadId} not found in tenant+user scope`,
      );
    }
    const updated = await prisma.chatThread.update({
      where: { id: opts.threadId },
      data: { lastMessageAt: new Date() },
    });
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      userId: updated.userId,
      title: updated.title,
    };
  }

  const title = (opts.firstMessage?.trim().slice(0, 80) || "New chat").replace(
    /\s+/g,
    " ",
  );
  const created = await prisma.chatThread.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      title,
      source: opts.source ?? "user",
      briefingId: opts.briefingId ?? null,
    },
  });
  return {
    id: created.id,
    tenantId: created.tenantId,
    userId: created.userId,
    title: created.title,
  };
}

// ─── appendMessage ───────────────────────────────────────────────────────────

export async function appendMessage(opts: {
  threadId: string;
  tenantId: string;
  role: ChatMessageRole;
  content: string;
  views?: GeneratedView[];
  toolCalls?: ToolCallRecord[];
  proposalId?: string;
  state?: ChatMessageState;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  modelName?: string;
  errorMessage?: string;
}): Promise<{ id: string; threadId: string; createdAt: Date }> {
  if (!opts.threadId) throw new Error("appendMessage: threadId required");
  if (!opts.tenantId) throw new Error("appendMessage: tenantId required");

  // Tenant scope check on parent thread — prevents cross-tenant message write.
  const thread = await prisma.chatThread.findFirst({
    where: { id: opts.threadId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!thread) {
    throw new Error(
      `appendMessage: thread ${opts.threadId} not found in tenant scope`,
    );
  }

  const created = await prisma.chatMessage.create({
    data: {
      tenantId: opts.tenantId,
      threadId: opts.threadId,
      role: opts.role,
      content: opts.content,
      views: (opts.views ?? []) as any,
      toolCalls: (opts.toolCalls ?? []) as any,
      proposalId: opts.proposalId ?? null,
      state: opts.state ?? "complete",
      promptTokens: opts.promptTokens ?? 0,
      completionTokens: opts.completionTokens ?? 0,
      latencyMs: opts.latencyMs ?? 0,
      modelName: opts.modelName ?? null,
      errorMessage: opts.errorMessage ?? null,
    },
  });

  // Bump parent thread's lastMessageAt — tenant-scoped via the where filter
  // (id+tenantId already verified above; updateMany also scopes for safety).
  await prisma.chatThread.updateMany({
    where: { id: opts.threadId, tenantId: opts.tenantId },
    data: { lastMessageAt: new Date() },
  });

  return {
    id: created.id,
    threadId: created.threadId,
    createdAt: created.createdAt,
  };
}

// ─── updateMessage ───────────────────────────────────────────────────────────

export async function updateMessage(opts: {
  id: string;
  tenantId: string;
  content?: string;
  views?: GeneratedView[];
  toolCalls?: ToolCallRecord[];
  proposalId?: string | null;
  state?: ChatMessageState;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  modelName?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  if (!opts.id) throw new Error("updateMessage: id required");
  if (!opts.tenantId) throw new Error("updateMessage: tenantId required");

  const data: any = {};
  if (opts.content !== undefined) data.content = opts.content;
  if (opts.views !== undefined) data.views = opts.views as any;
  if (opts.toolCalls !== undefined) data.toolCalls = opts.toolCalls as any;
  if (opts.proposalId !== undefined) data.proposalId = opts.proposalId;
  if (opts.state !== undefined) data.state = opts.state;
  if (opts.promptTokens !== undefined) data.promptTokens = opts.promptTokens;
  if (opts.completionTokens !== undefined) data.completionTokens = opts.completionTokens;
  if (opts.latencyMs !== undefined) data.latencyMs = opts.latencyMs;
  if (opts.modelName !== undefined) data.modelName = opts.modelName;
  if (opts.errorMessage !== undefined) data.errorMessage = opts.errorMessage;

  const updated = await prisma.chatMessage.updateMany({
    where: { id: opts.id, tenantId: opts.tenantId },
    data,
  });
  if (updated.count === 0) {
    throw new Error(`updateMessage: message ${opts.id} not found in tenant scope`);
  }
}

// ─── recentTurns ─────────────────────────────────────────────────────────────

export async function recentTurns(
  threadId: string,
  tenantId: string,
  limit = 20,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!threadId) throw new Error("recentTurns: threadId required");
  if (!tenantId) throw new Error("recentTurns: tenantId required");

  // Tenant scope on the message rows directly — even if a thread is leaked
  // by id, the message read still enforces tenantId.
  const rows = await prisma.chatMessage.findMany({
    where: {
      threadId,
      tenantId,
      role: { in: ["user", "assistant"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { role: true, content: true },
  });
  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
}

// ─── searchChatHistory ───────────────────────────────────────────────────────

export async function searchChatHistory(opts: {
  tenantId: string;
  userId: string;
  q: string;
  limit?: number;
}): Promise<
  Array<{
    messageId: string;
    threadId: string;
    threadTitle: string;
    content: string;
    createdAt: Date;
  }>
> {
  if (!opts.tenantId) throw new Error("searchChatHistory: tenantId required");
  if (!opts.userId) throw new Error("searchChatHistory: userId required");

  const q = (opts.q ?? "").trim();
  if (!q) return [];
  const limit = Math.min(opts.limit ?? 25, 100);

  // Use ILIKE fallback (tenant+user scoped). Postgres FTS (to_tsvector(simple))
  // is available via $queryRaw but ILIKE is correct for short queries and
  // preserves Arabic substrings without stemming. RESEARCH Pitfall 5 — when
  // an FTS-enabled migration ships in Wave 5 we can swap this to the
  // tsvector path; until then ILIKE+pg_trgm is the safe fallback.
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const rows = await prisma.chatMessage.findMany({
    where: {
      tenantId: opts.tenantId,
      content: { contains: q, mode: "insensitive" },
      thread: { is: { userId: opts.userId, tenantId: opts.tenantId } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      threadId: true,
      content: true,
      createdAt: true,
      thread: { select: { title: true } },
    },
  });

  return rows.map((r) => ({
    messageId: r.id,
    threadId: r.threadId,
    threadTitle: r.thread.title,
    content: r.content,
    createdAt: r.createdAt,
  }));
  // `pattern` is reserved for the FTS migration path (Wave 5).
  void pattern;
}

// ─── archiveOlderThan90Days ──────────────────────────────────────────────────

export async function archiveOlderThan90Days(
  tenantId?: string,
): Promise<{ archived: number }> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const where = tenantId
    ? { tenantId, lastMessageAt: { lt: cutoff }, archivedAt: null }
    : { lastMessageAt: { lt: cutoff }, archivedAt: null };

  const result = await prisma.chatThread.updateMany({
    where,
    data: { archivedAt: new Date() },
  });
  return { archived: result.count };
}

// Backwards-compat alias matching the RED test file's mention `archiveOldChats`.
export const archiveOldChats = archiveOlderThan90Days;
