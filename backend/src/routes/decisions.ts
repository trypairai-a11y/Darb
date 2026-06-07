// Phase 2 Wave 2 — Decisions Surface API.
//
// /api/decisions/*  — the human-approval surface for the monitor agent's
// PendingAgentAction proposals. Mirrors the Phase 1 /api/queue routes but
// produces CON-decisions-card-shape projections (cardProjector.ts) and
// adds the dismiss + 5-minute undo flow on top of approve/reject.
//
// Endpoints (all authMiddleware + tenantScope; write paths additionally
// rbac-gated):
//
//   GET  /                — paginated DecisionCardData[] + filter counts
//   GET  /pending-count   — sidebar badge { count }
//   GET  /:id             — single permalink card
//   POST /:id/approve     — re-invoke live tool with ctx.userId set;
//                           write AgentAction; resolve via optimistic lock
//   POST /:id/dismiss     — write AgentMemory(dismissed:*); resolve
//   POST /:id/undo        — within 5m of approval, mark AgentAction
//                           rolled_back; revert PendingAgentAction
//
// REQ-decisions-proposal-inbox / REQ-agent-propose-confirm.

import { Router, Request, Response } from "express";
import type { UserRole } from "../generated/prisma";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { toolRegistry, type ToolContext } from "../agent/registry";
import { writeAgentAction, upsertAgentMemory } from "../agent";
import { publishEvent } from "../services/eventBus";
import {
  projectPendingAction,
  PHASE_2_LIVE_TOOLS,
  type DecisionCardData,
  type DecisionTag,
} from "../services/decisions/cardProjector";

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Helpers ──────────────────────────────────────────────────────────────

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function parsePagination(req: Request): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit =
    Number.parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

function startOfWeekUTC(now = new Date()): Date {
  // Monday = start of week (UTC). Kuwait calendar uses Sun-Sat but the UI
  // chip "This week" is shown to ops staff on a calendar week so Monday is
  // the cleaner anchor; refine in a later phase if needed.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0..6 (Sun..Sat)
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

/**
 * Reverse map of TOOL_TO_TAG / INTENT_TO_TAG: takes a UI-tag chip and
 * narrows the Prisma where clause. Used by the GET / list filter chips.
 */
function whereForTag(tag: DecisionTag): Record<string, unknown> | null {
  switch (tag) {
    case "Penalty":
      return { toolName: "applyPenalty" };
    case "Suspend":
      return { toolName: "suspendDriver" };
    case "Cash reminder":
      return {
        OR: [
          { toolName: "proposeCashReminder" },
          {
            toolName: "draftCourierMessage",
            input: { path: ["intent"], equals: "CASH_REMINDER" },
          },
        ],
      };
    case "Promote":
      return {
        toolName: "draftCourierMessage",
        input: { path: ["intent"], equals: "PROMOTE_TOP_PERFORMER" },
      };
    case "Warn":
      // Default warn = draftCourierMessage (excluding cash/promote intents)
      // + legacy proposeCoachingMessage. Use a broad OR; the projector's
      // intent override will refine the chip later.
      return {
        OR: [
          {
            toolName: "draftCourierMessage",
            NOT: [
              {
                input: {
                  path: ["intent"],
                  equals: "CASH_REMINDER",
                },
              },
              {
                input: {
                  path: ["intent"],
                  equals: "PROMOTE_TOP_PERFORMER",
                },
              },
            ],
          },
          { toolName: "proposeCoachingMessage" },
        ],
      };
    case "Review":
      return {
        toolName: { in: ["flagForReview", "proposeAppealDecision"] },
      };
    case "Other":
      return { toolName: "snoozeAlert" };
    default:
      return null;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /  — paginated cards + per-chip counts.
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status ?? "pending");
    const filter = String(req.query.filter ?? "all");
    const sort = String(req.query.sort ?? "priority");

    const where: Record<string, unknown> = { tenantId };
    where.resolvedAt = status === "pending" ? null : { not: null };

    if (filter === "high-conf") {
      where.confidence = { gte: 0.8 };
    } else if (filter === "this-week") {
      where.createdAt = { gte: startOfWeekUTC() };
    } else if (filter === "all" || filter === "pending") {
      // no-op
    } else {
      // Treat as a tag chip. Capitalise so "warn" → "Warn".
      const tagLabel = filter.charAt(0).toUpperCase() + filter.slice(1);
      const tagWhere = whereForTag(tagLabel as DecisionTag);
      if (tagWhere) Object.assign(where, tagWhere);
    }

    let orderBy: Array<Record<string, "asc" | "desc">>;
    switch (sort) {
      case "newest":
        orderBy = [{ createdAt: "desc" }];
        break;
      case "confidence":
        orderBy = [{ confidence: "desc" }, { createdAt: "desc" }];
        break;
      case "priority":
      default:
        orderBy = [{ priorityScore: "desc" }, { createdAt: "desc" }];
        break;
    }

    const [rows, total] = await Promise.all([
      prisma.pendingAgentAction.findMany({
        where: where as any,
        skip,
        take: limit,
        orderBy,
      }),
      prisma.pendingAgentAction.count({ where: where as any }),
    ]);

    const cards: DecisionCardData[] = await Promise.all(
      rows.map((r) =>
        projectPendingAction(r as any, { tenantId }),
      ),
    );

    // Per-chip counts. Phase 2 acceptable to fan out 8 small count queries;
    // Phase 11 should cache.
    const baseCountWhere: Record<string, unknown> = { tenantId, resolvedAt: null };
    const countWhere = (extra: Record<string, unknown>) => ({
      ...baseCountWhere,
      ...extra,
    });
    const [
      allCount,
      pendingCount,
      highConfCount,
      thisWeekCount,
      penaltyCount,
      cashCount,
      warnCount,
      suspendCount,
      promoteCount,
    ] = await Promise.all([
      prisma.pendingAgentAction.count({ where: { tenantId } as any }),
      prisma.pendingAgentAction.count({ where: baseCountWhere as any }),
      prisma.pendingAgentAction.count({
        where: countWhere({ confidence: { gte: 0.8 } }) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere({ createdAt: { gte: startOfWeekUTC() } }) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere(whereForTag("Penalty") ?? {}) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere(whereForTag("Cash reminder") ?? {}) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere(whereForTag("Warn") ?? {}) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere(whereForTag("Suspend") ?? {}) as any,
      }),
      prisma.pendingAgentAction.count({
        where: countWhere(whereForTag("Promote") ?? {}) as any,
      }),
    ]);

    return res.json({
      cards,
      counts: {
        all: allCount,
        pending: pendingCount,
        "high-conf": highConfCount,
        "this-week": thisWeekCount,
        penalty: penaltyCount,
        cash: cashCount,
        warn: warnCount,
        suspend: suspendCount,
        promote: promoteCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// GET /pending-count — sidebar badge.
router.get("/pending-count", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const count = await prisma.pendingAgentAction.count({
      where: { tenantId, resolvedAt: null } as any,
    });
    return res.json({ count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// GET /:id — permalink card.
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const pa = await prisma.pendingAgentAction.findFirst({
      where: { id: req.params.id, tenantId } as any,
    });
    if (!pa) return res.status(404).json({ error: "Decision not found" });
    const card = await projectPendingAction(pa as any, { tenantId });
    return res.json(card);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// POST /:id/approve  — confirm a proposed action.
//
// Live tool (PHASE_2_LIVE_TOOLS):
//   1. findFirst → 404 if missing
//   2. resolvedAt non-null → 409 (early bail; the optimistic-lock path
//      below catches the race window)
//   3. updateMany where {id, resolvedAt: null} → if count !== 1 then 409
//      (race-safe: another writer claimed the row first; T-02-14)
//   4. toolRegistry.invoke(toolName, ctx with userId, finalInput) — the
//      registry's gate falls through to .execute() because ctx.userId is
//      set, so the tool body fires (e.g. notification.create for
//      draftCourierMessage)
//   5. writeAgentAction(...) — the canonical CON-audit-row-shape ledger
//   6. publishEvent("agent_action_resolved")
//
// Non-live tool (audit-only — flagForReview, proposeCashReminder, Phase-8
// hints): same flow but step 4 is skipped; the AgentAction row is still
// written with outcome="success" so the founder sees the approval in the
// audit log.
router.post(
  "/:id/approve",
  rbac("ADMIN", "OPS_MANAGER", "SUPERVISOR"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const role = req.user!.role as UserRole;

      const {
        modifications,
        source: rawSource,
        threadId: rawThreadId,
        msgId: rawMsgId,
      } = (req.body ?? {}) as {
        modifications?: Record<string, unknown>;
        source?: string;
        threadId?: string;
        msgId?: string;
      };

      // Allow-list source values — never trust caller input verbatim
      // (T-04-W2-05 — AgentAction.source becomes part of the audit log).
      const allowedSources = new Set([
        "decisions",
        "chat",
        "briefing",
        "auto",
      ]);
      const source: "decisions" | "chat" | "briefing" | "auto" = allowedSources.has(
        String(rawSource ?? ""),
      )
        ? (rawSource as "decisions" | "chat" | "briefing" | "auto")
        : "decisions";
      const chatThreadId =
        source === "chat" && typeof rawThreadId === "string" ? rawThreadId : null;
      const chatMessageId =
        source === "chat" && typeof rawMsgId === "string" ? rawMsgId : null;

      const pa = await prisma.pendingAgentAction.findFirst({
        where: { id: req.params.id, tenantId } as any,
      });
      if (!pa) return res.status(404).json({ error: "Decision not found" });
      if (pa.resolvedAt) {
        return res
          .status(409)
          .json({ error: "Decision already resolved", resolution: pa.resolution });
      }

      // Optimistic-lock claim. Either we win (count=1) or lose (count=0).
      const claim = await prisma.pendingAgentAction.updateMany({
        where: { id: pa.id, resolvedAt: null } as any,
        data: {
          resolvedAt: new Date(),
          resolution: "approved",
          resolvedBy: userId,
        } as any,
      });
      if (claim.count !== 1) {
        return res
          .status(409)
          .json({ error: "Decision already resolved by another writer" });
      }

      // Apply approver's edits within the tool's editableParams allow-list.
      // Out-of-list keys are silently dropped (T-02-10 mitigation).
      const tool = toolRegistry.get(pa.toolName);
      const editable = new Set(tool?.editableParams ?? []);
      const safeMods: Record<string, unknown> = {};
      if (modifications && typeof modifications === "object") {
        for (const [k, v] of Object.entries(modifications)) {
          if (editable.has(k)) safeMods[k] = v;
        }
      }
      const finalInput = Object.keys(safeMods).length
        ? { ...((pa.input as object) ?? {}), ...safeMods }
        : (pa.input as unknown);

      const isLive = PHASE_2_LIVE_TOOLS.has(pa.toolName);
      let outcome: "success" | "failure" = "success";
      let errorMessage: string | undefined;
      let toolOutput: unknown = undefined;

      if (isLive) {
        const ctx: ToolContext = {
          tenantId,
          agentId: pa.agentId,
          runId: pa.runId,
          actorRole: role,
          userId,
        };
        // 4th arg `{}` is intentional — registry.invoke's opts are only
        // used on the proposal path (requiresApproval && !ctx.userId);
        // since ctx.userId is set here we fall through to .execute().
        // Passing `{}` keeps the call shape stable for tests that spy on
        // the invoke signature.
        const result = await toolRegistry.invoke(pa.toolName, ctx, finalInput, {});
        if (result.status === "executed") {
          toolOutput = result.output;
        } else {
          outcome = "failure";
          errorMessage = result.error;
        }
      } else {
        // Audit-only tools: no side effect; record the approval in the
        // ledger so the operator's confirm is captured for training.
        toolOutput = { audit_only: true };
      }

      const audit = await writeAgentAction({
        tenantId,
        approverUserId: userId,
        agentRunId: pa.runId,
        toolName: pa.toolName,
        originalProposal: pa.input,
        modificationsBeforeApproval: Object.keys(safeMods).length
          ? safeMods
          : null,
        outcome,
        reasoning: pa.reasoning,
        errorMessage,
        subjectType: pa.subjectType ?? undefined,
        subjectId: pa.subjectId ?? undefined,
        source,
        chatThreadId,
        chatMessageId,
      });

      await publishEvent({
        type: "agent_action_resolved",
        tenantId,
        timestamp: new Date().toISOString(),
        payload: {
          pendingActionId: pa.id,
          agentActionId: audit.id,
          resolution: "approved",
          isLive,
        },
      });

      return res.json({
        agentActionId: audit.id,
        outcome,
        output: toolOutput,
        errorMessage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

// POST /:id/dismiss — reject a proposal + write the dismissed:* memory
// row that the monitor's next tick reads to suppress identical proposals
// for 7 days (CON-dismiss-suppression-7-day).
router.post(
  "/:id/dismiss",
  rbac("ADMIN", "OPS_MANAGER", "SUPERVISOR"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const reason = (req.body?.reason ?? "").toString().trim();
      if (!reason) {
        return res.status(400).json({ error: "reason required" });
      }

      const pa = await prisma.pendingAgentAction.findFirst({
        where: { id: req.params.id, tenantId } as any,
      });
      if (!pa) return res.status(404).json({ error: "Decision not found" });
      if (pa.resolvedAt) {
        return res
          .status(409)
          .json({ error: "Decision already resolved", resolution: pa.resolution });
      }

      const claim = await prisma.pendingAgentAction.updateMany({
        where: { id: pa.id, resolvedAt: null } as any,
        data: {
          resolvedAt: new Date(),
          resolution: "rejected",
          overrideReason: reason,
          resolvedBy: userId,
        } as any,
      });
      if (claim.count !== 1) {
        return res
          .status(409)
          .json({ error: "Decision already resolved by another writer" });
      }

      const memoryKey = `dismissed:${pa.toolName}:${pa.subjectType ?? "_"}:${pa.subjectId ?? "_"}`;
      const memory = await upsertAgentMemory({
        tenantId,
        key: memoryKey,
        value: {
          reason,
          dismissedBy: userId,
          dismissedAt: new Date().toISOString(),
          originalProposal: pa.input,
          pendingActionId: pa.id,
        },
        confidence: 0.95,
        source: "user_correction",
        agentRunId: pa.runId,
      });

      await publishEvent({
        type: "agent_action_resolved",
        tenantId,
        timestamp: new Date().toISOString(),
        payload: {
          pendingActionId: pa.id,
          resolution: "rejected",
          memoryKey,
        },
      });

      return res.json({ agentMemoryId: memory.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

// POST /:id/undo — revert an approval within the 5-minute window. Older
// rollbacks must use POST /api/audit/agent-actions/:id/rollback (admin
// only, T-02-15 mitigation).
const UNDO_WINDOW_MS = 5 * 60 * 1000;

router.post(
  "/:id/undo",
  rbac("ADMIN", "OPS_MANAGER", "SUPERVISOR"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;

      const pa = await prisma.pendingAgentAction.findFirst({
        where: { id: req.params.id, tenantId } as any,
      });
      if (!pa) return res.status(404).json({ error: "Decision not found" });
      if (!pa.resolvedAt) {
        return res
          .status(409)
          .json({ error: "Decision is not yet approved" });
      }
      if (pa.resolution !== "approved") {
        return res
          .status(409)
          .json({ error: "Only approvals can be undone" });
      }

      const audit = await prisma.agentAction.findFirst({
        where: {
          tenantId,
          agentRunId: pa.runId,
          subjectType: pa.subjectType,
          subjectId: pa.subjectId,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!audit) {
        return res
          .status(404)
          .json({ error: "Audit row not found for this proposal" });
      }
      const elapsed = Date.now() - new Date(audit.createdAt).getTime();
      if (elapsed > UNDO_WINDOW_MS) {
        return res.status(409).json({
          error:
            "Undo window expired (5 min). Use /api/audit/agent-actions/:id/rollback.",
        });
      }

      await prisma.agentAction.update({
        where: { id: audit.id } as any,
        data: {
          rolledBackAt: new Date(),
          rolledBackById: userId,
          rollbackReason: "user-undo",
          outcome: "rolled_back",
        } as any,
      });
      await prisma.pendingAgentAction.update({
        where: { id: pa.id } as any,
        data: {
          resolvedAt: null,
          resolution: null,
          overrideReason: null,
          resolvedBy: null,
        } as any,
      });

      await publishEvent({
        type: "agent_action_resolved",
        tenantId,
        timestamp: new Date().toISOString(),
        payload: {
          pendingActionId: pa.id,
          agentActionId: audit.id,
          resolution: "rolled_back",
        },
      });

      return res.json({
        agentActionId: audit.id,
        rolledBackAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

export default router;
