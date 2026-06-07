import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { UserRole } from "../generated/prisma";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { publishEvent, type DarbEvent, type DarbEventType } from "../services/eventBus";
import { toolRegistry, type ToolContext } from "./registry";

function detectUserLanguage(text?: string): "Arabic" | "English" {
  return /[\u0600-\u06FF]/.test(text ?? "") ? "Arabic" : "English";
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentId = "triage" | "reconciliation" | "narrator" | "chat" | "monitor" | "score-explainer";

export interface AgentDefinition {
  id: AgentId;
  /** Description for logs and the admin UI. */
  description: string;
  /** Event types that trigger this agent, plus "cron" for scheduled runs. */
  triggers: Array<DarbEventType | "cron">;
  /** RBAC role the agent runs under (governs which tools it can call). */
  actorRole: UserRole;
  /** Claude model id. */
  model: string;
  maxTokens: number;
  maxIterations: number;
  /** Path (relative to agent/prompts) for the system prompt. */
  promptFile: string;
}

export interface RunAgentInput {
  tenantId: string;
  triggerEvent: string;
  /** Opaque per-trigger payload included in the first user turn. */
  payload?: Record<string, unknown>;
  /** If set, the conversation opens with this user message (chat mode). */
  userMessage?: string;
  /** Conversation history (chat mode). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * Phase 4 Wave 1 — optional streaming hooks. When set, runAgent uses
   * Anthropic `client.messages.stream()` instead of `messages.create()` so
   * partial text + describeView results + pending-action ids can be pushed
   * down an SSE channel as they arrive. Non-streaming callers (Phase 1+2+3)
   * leave this undefined and behaviour is unchanged.
   */
  stream?: {
    onTextDelta?(delta: string): void;
    /** Type-erased to keep runtime free of frontend type deps. */
    onView?(view: unknown): void;
    onPendingAction?(pendingActionId: string): void;
    /** Polled at the top of each tool-loop iteration. Truthy return aborts. */
    onCancel?(): boolean;
  };
}

export interface RunAgentResult {
  runId: string;
  status: "completed" | "failed" | "disabled" | "cancelled";
  text?: string;
  actionsProposed: number;
  pendingActionIds: string[];
  /** Phase 4 Wave 1 — collected describeView outputs in tool-call order. */
  views?: unknown[];
  error?: string;
}

// ─── Agent registry ──────────────────────────────────────────────────────────

const agents = new Map<AgentId, AgentDefinition>();

export function registerAgent(def: AgentDefinition) {
  agents.set(def.id, def);
}

export function getAgent(id: AgentId): AgentDefinition | undefined {
  return agents.get(id);
}

export function listAgents(): AgentDefinition[] {
  return [...agents.values()];
}

// ─── Prompt loader (read once per process, cached) ───────────────────────────

const promptCache = new Map<string, string>();
function loadPrompt(file: string): string {
  const cached = promptCache.get(file);
  if (cached) return cached;
  const fullPath = path.join(__dirname, "prompts", file);
  try {
    const contents = fs.readFileSync(fullPath, "utf8");
    promptCache.set(file, contents);
    return contents;
  } catch (err) {
    logger.warn({ err, file }, "agentRuntime: prompt file missing, using empty prompt");
    return "";
  }
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

/**
 * Run an agent. Generalised tool-loop — tools come from the shared
 * ToolRegistry (with RBAC, approval gates, and audit), every run is
 * persisted in AgentRunLog, and missing ANTHROPIC_API_KEY returns
 * status: "disabled" instead of throwing.
 */
export async function runAgent(
  agentId: AgentId,
  input: RunAgentInput
): Promise<RunAgentResult> {
  const agent = agents.get(agentId);
  if (!agent) {
    return {
      runId: "",
      status: "failed",
      actionsProposed: 0,
      pendingActionIds: [],
      error: `Unknown agent: ${agentId}`,
    };
  }

  // Persist the AgentRunLog row FIRST — even when ANTHROPIC_API_KEY is
  // absent, the spine-integrity contract (walkingSkeleton.test.ts) requires
  // a row to exist so callers can correlate the request with a runId.
  // The disabled-path then returns immediately after stamping the row.
  const runLog = await prisma.agentRunLog.create({
    data: {
      tenantId: input.tenantId,
      agentId: agent.id,
      triggerEvent: input.triggerEvent,
      model: agent.model,
    },
  });

  if (!env.ANTHROPIC_API_KEY) {
    await prisma.agentRunLog.update({
      where: { id: runLog.id },
      data: {
        finishedAt: new Date(),
        status: "disabled",
      },
    });
    return {
      runId: runLog.id,
      status: "disabled",
      text: "Agent runtime disabled: ANTHROPIC_API_KEY not configured.",
      actionsProposed: 0,
      pendingActionIds: [],
    };
  }

  const ctx: ToolContext = {
    tenantId: input.tenantId,
    agentId: agent.id,
    runId: runLog.id,
    actorRole: agent.actorRole,
  };

  // Threat T-02-01 — monitor must never carry a userId in its ToolContext.
  // The monitor agent runs unattended on cron and only PROPOSES write actions
  // through the registry's approval gate (which fires when ctx.userId is
  // unset and tool.requiresApproval is true). If a misguided test or a future
  // refactor injects a userId here, write tools would skip the approval gate
  // and execute their side effects unattended, breaking propose-and-confirm.
  // We construct ctx without userId above; this assertion makes the
  // invariant explicit so the failure mode (if any) is loud and immediate.
  if (agent.id === "monitor" && (ctx as { userId?: string }).userId !== undefined) {
    throw new Error("monitor agent must never carry a userId in ToolContext");
  }

  const systemPrompt = loadPrompt(agent.promptFile);
  const now = new Date();
  const kuwaitDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const kuwaitTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuwait",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const userLanguage = detectUserLanguage(input.userMessage);
  const runtimeContext = [
    "Runtime context:",
    `Current date in Kuwait: ${kuwaitDate}.`,
    `Current time in Kuwait: ${kuwaitTime}.`,
    "For words like today, yesterday, this week, and this month, use this Kuwait date.",
    `Detected user message language: ${userLanguage}.`,
    "Reply in the detected user message language unless the user explicitly asks for another language.",
    `Trigger: ${input.triggerEvent}.`,
    `Payload: ${JSON.stringify(input.payload ?? {})}.`,
  ].join("\n");
  const tools = toolRegistry.getAnthropicSchema(agent.id, agent.actorRole);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Build initial messages: history + user message + trigger payload
  const initialUserContent = input.userMessage
    ? `${runtimeContext}\n\nUser message: ${input.userMessage}`
    : `${runtimeContext}\n\nFollow your instructions.`;

  const messages: Anthropic.MessageParam[] = [
    ...(input.history ?? []).map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: "user", content: initialUserContent },
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let actionsProposed = 0;
  const pendingActionIds: string[] = [];
  let finalText = "";
  // Phase 4 Wave 1 — collected describeView outputs.
  const views: unknown[] = [];
  let cancelled = false;

  try {
    for (let i = 0; i < agent.maxIterations; i++) {
      // Cancel poll at the top of each iteration (Phase 4 Wave 1).
      if (input.stream?.onCancel?.()) {
        cancelled = true;
        break;
      }

      let response: Anthropic.Message;
      if (input.stream) {
        // Streaming path — push text deltas through onTextDelta as they arrive
        // and resolve to the final assembled Message via .finalMessage().
        const streamCtl = client.messages.stream({
          model: agent.model,
          max_tokens: agent.maxTokens,
          system: `${systemPrompt}\n\n${runtimeContext}`,
          tools,
          messages,
        });
        streamCtl.on("text", (delta: string) => {
          if (delta) input.stream?.onTextDelta?.(delta);
        });
        response = await streamCtl.finalMessage();
      } else {
        response = await client.messages.create({
          model: agent.model,
          max_tokens: agent.maxTokens,
          system: `${systemPrompt}\n\n${runtimeContext}`,
          tools,
          messages,
        });
      }

      promptTokens += response.usage.input_tokens;
      completionTokens += response.usage.output_tokens;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b) => b.text).join("\n").trim();
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        // Agents can pass recommendation metadata on the tool input under the
        // reserved key "_meta" to hint the registry when staging approvals.
        const rawInput = toolUse.input as Record<string, unknown> & {
          _meta?: { recommendation?: string; reasoning?: string; confidence?: number; priorityScore?: number; subjectType?: string; subjectId?: string };
        };
        const { _meta, ...toolInput } = rawInput;

        const result = await toolRegistry.invoke(toolUse.name, ctx, toolInput, _meta ?? {});

        if (result.status === "pending_approval" && result.pendingActionId) {
          actionsProposed++;
          pendingActionIds.push(result.pendingActionId);
          await publishEvent({
            type: "agent_action_pending",
            tenantId: input.tenantId,
            timestamp: new Date().toISOString(),
            payload: { pendingActionId: result.pendingActionId, agentId: agent.id, toolName: toolUse.name },
          } as DarbEvent);
          // Phase 4 Wave 1 — surface the staged proposal id to the chat UI
          // so it can render the confirm card next to the assistant turn.
          input.stream?.onPendingAction?.(result.pendingActionId);
        }

        // Phase 4 Wave 1 — capture describeView outputs and stream them.
        if (
          toolUse.name === "describeView" &&
          result.status === "executed" &&
          result.output &&
          typeof result.output === "object"
        ) {
          const out = result.output as { view?: unknown };
          const v = out.view ?? result.output;
          views.push(v);
          input.stream?.onView?.(v);
        }

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: result.status === "error" || result.status === "forbidden",
        });
      }

      messages.push({ role: "user", content: toolResultBlocks });
    }

    if (cancelled) {
      await prisma.agentRunLog.update({
        where: { id: runLog.id },
        data: {
          finishedAt: new Date(),
          status: "cancelled",
          promptTokens,
          completionTokens,
          actionsProposed,
        },
      });
      return {
        runId: runLog.id,
        status: "cancelled",
        text: finalText,
        actionsProposed,
        pendingActionIds,
        views,
      };
    }

    await prisma.agentRunLog.update({
      where: { id: runLog.id },
      data: {
        finishedAt: new Date(),
        status: "completed",
        promptTokens,
        completionTokens,
        actionsProposed,
      },
    });

    return {
      runId: runLog.id,
      status: "completed",
      text: finalText,
      actionsProposed,
      pendingActionIds,
      views,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, agentId, runId: runLog.id }, "agentRuntime: run failed");
    await prisma.agentRunLog.update({
      where: { id: runLog.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        error: message,
        promptTokens,
        completionTokens,
      },
    });
    return {
      runId: runLog.id,
      status: "failed",
      actionsProposed,
      pendingActionIds,
      error: message,
    };
  }
}
