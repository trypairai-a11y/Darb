import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { UserRole } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToolSideEffect = "read" | "write" | "notify";

export interface ToolContext {
  tenantId: string;
  agentId: string;           // "triage" | "reconciliation" | "narrator" | "chat"
  runId: string;             // correlation ID — AgentRunLog.id
  actorRole: UserRole;       // RBAC role the agent is running under
  userId?: string;           // set only when a human approves a gated write
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  /** JSON Schema exposed to Claude (must match the Anthropic SDK shape). */
  inputSchema: Anthropic.Tool["input_schema"];
  /** Zod schema used for runtime validation of `input` before executing. */
  inputValidator: z.ZodType<I>;
  sideEffect: ToolSideEffect;
  requiredRole: UserRole[];
  /** If true, invoking this tool enqueues a PendingAgentAction instead of executing immediately. */
  requiresApproval: boolean;
  /** Which agents may call this tool. Use ["*"] to allow all. */
  allowedAgents: string[];
  /**
   * When true (default for Phase 1 read tools), Anthropic grammar-constrained
   * sampling enforces inputSchema. Requires `additionalProperties: false`.
   * Set explicitly false to opt out (e.g. legacy tools that haven't been
   * audited for strict-mode compatibility).
   */
  strict?: boolean;
  /**
   * Phase 2 — UI hint for the Decisions Edit Drawer (UI-SPEC §3.1.3).
   * Lists the input parameter names a human approver may edit before
   * confirming the proposal. An empty array (or undefined) means audit-only
   * review (the approver can only approve / dismiss as-is, with no field
   * tweaks). Used by the front-end to render the right form controls and by
   * the backend approve route to clamp incoming edits to this allow-list —
   * any param outside `editableParams` is silently dropped from the user's
   * patch so a malicious approver can't twist a proposal into something the
   * monitor never drafted.
   */
  editableParams?: string[];
  execute: (ctx: ToolContext, input: I) => Promise<O>;
}

export interface InvokeResult<O = unknown> {
  status: "executed" | "pending_approval" | "forbidden" | "error";
  output?: O;
  pendingActionId?: string;
  error?: string;
}

// ─── Registry ────────────────────────────────────────────────────────────────

class ToolRegistryImpl {
  private tools = new Map<string, ToolDefinition<any, any>>();

  register<I, O>(def: ToolDefinition<I, O>): void {
    if (this.tools.has(def.name)) {
      // Logger may be undefined in test environments where mocks/config.ts
      // doesn't export it. Defensive optional-chain prevents the duplicate
      // warning from crashing the test suite while still surfacing the
      // signal in production logs.
      logger?.warn?.({ tool: def.name }, "toolRegistry: replacing existing tool");
    }
    this.tools.set(def.name, def as ToolDefinition);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** List tools visible to a given agent + role. */
  list(agentId: string, role: UserRole): ToolDefinition[] {
    return [...this.tools.values()].filter(
      (t) =>
        (t.allowedAgents.includes("*") || t.allowedAgents.includes(agentId)) &&
        t.requiredRole.includes(role)
    );
  }

  /** Emit Anthropic-compatible tool schemas for the model. */
  getAnthropicSchema(agentId: string, role: UserRole): Anthropic.Tool[] {
    return this.list(agentId, role).map((t) => {
      return {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      };
    });
  }

  /**
   * Invoke a tool by name. Validates input, enforces RBAC and approval gate,
   * persists an AgentToolCall audit row on execute, or a PendingAgentAction
   * row when the tool requires approval.
   */
  async invoke(
    name: string,
    ctx: ToolContext,
    rawInput: unknown,
    opts: { recommendation?: string; reasoning?: string; confidence?: number; priorityScore?: number; subjectType?: string; subjectId?: string } = {}
  ): Promise<InvokeResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { status: "error", error: `Unknown tool: ${name}` };
    }

    // RBAC gate
    if (!tool.requiredRole.includes(ctx.actorRole)) {
      return { status: "forbidden", error: `Role ${ctx.actorRole} cannot invoke ${name}` };
    }

    // Agent allowlist
    if (!tool.allowedAgents.includes("*") && !tool.allowedAgents.includes(ctx.agentId)) {
      return { status: "forbidden", error: `Agent ${ctx.agentId} cannot invoke ${name}` };
    }

    // Validate input
    const parsed = tool.inputValidator.safeParse(rawInput);
    if (!parsed.success) {
      return { status: "error", error: `Invalid input: ${parsed.error.message}` };
    }
    const input = parsed.data;

    // Approval gate — when set, don't execute; persist for human review.
    //
    // Auto-send mode: setting AGENT_AUTO_APPROVE="true" removes the human
    // confirmation step entirely — gated tools execute immediately and their
    // notification is sent automatically, with the execution recorded in the
    // AgentToolCall audit trail (approvedBy = null, i.e. system-initiated).
    //
    // Default (unset) preserves the propose-and-confirm flow: proposals queue
    // as PendingAgentAction rows for one-click approval. This keeps the v1
    // "agent never executes unattended" invariant (see neverExecutes.test.ts)
    // as the code/test default; auto-send is opted into per-environment.
    const autoApprove = process.env.AGENT_AUTO_APPROVE === "true";
    if (tool.requiresApproval && !ctx.userId && !autoApprove) {
      const pending = await prisma.pendingAgentAction.create({
        data: {
          tenantId: ctx.tenantId,
          runId: ctx.runId,
          agentId: ctx.agentId,
          toolName: name,
          input: input as any,
          recommendation: opts.recommendation ?? "approve",
          reasoning: opts.reasoning ?? "",
          confidence: opts.confidence ?? 0,
          priorityScore: opts.priorityScore ?? 0,
          subjectType: opts.subjectType,
          subjectId: opts.subjectId,
        },
      });
      return { status: "pending_approval", pendingActionId: pending.id };
    }

    // Execute + audit
    const startedAt = Date.now();
    try {
      const output = await tool.execute(ctx, input);
      await prisma.agentToolCall.create({
        data: {
          runId: ctx.runId,
          toolName: name,
          input: input as any,
          output: (output ?? null) as any,
          durationMs: Date.now() - startedAt,
          approvedBy: ctx.userId,
        },
      });
      return { status: "executed", output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.agentToolCall.create({
        data: {
          runId: ctx.runId,
          toolName: name,
          input: input as any,
          error: message,
          durationMs: Date.now() - startedAt,
          approvedBy: ctx.userId,
        },
      });
      // Defensive optional-chain on logger — see register() above for context.
      logger?.error?.({ err, tool: name, runId: ctx.runId }, "toolRegistry: tool execution failed");
      return { status: "error", error: message };
    }
  }
}

export const toolRegistry = new ToolRegistryImpl();

/**
 * Type-inferred tool definition helper. Pairs the Zod validator's input type
 * with the execute function so call sites don't need to cast `input`.
 *
 * Usage:
 *   export const myTool = defineTool({
 *     name: "...",
 *     inputValidator: z.object({ foo: z.string() }),
 *     execute(ctx, input) { input.foo; ... },
 *     ...
 *   });
 */
export function defineTool<V extends z.ZodTypeAny, O>(
  def: Omit<ToolDefinition<z.infer<V>, O>, "inputValidator"> & { inputValidator: V }
): ToolDefinition<z.infer<V>, O> {
  return def as ToolDefinition<z.infer<V>, O>;
}
