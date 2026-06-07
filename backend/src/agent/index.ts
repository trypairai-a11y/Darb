import { registerAgent } from "./runtime";
import { registerTriageTools } from "./tools/_legacy/triage";
import { registerReconciliationTools } from "./tools/_legacy/reconciliation";
import { registerNarratorTools } from "./tools/_legacy/narrator";
import { registerAllReadTools } from "./tools/read";
import { AGENT_MODEL } from "./config";

/**
 * Register the three v2 agents. Each agent is a prompt + trigger set +
 * actor role; tools are registered separately per agent in `./tools/_legacy/*.ts`
 * (the `_legacy` slot houses the four tool modules ported in Phase 1
 * Wave 1; Wave 3 will add fresh purpose-built read tools alongside).
 *
 * Import order matters slightly: register agents BEFORE starting the
 * scheduler so `listAgents()` sees them.
 */

registerAgent({
  id: "triage",
  description:
    "Ranks pending decisions (appeals, violations, cash gaps, stale alerts) by business impact and produces the Command Centre attention queue.",
  triggers: ["violation", "appeal_submitted", "cash_record_upserted", "cron"],
  actorRole: "OPS_MANAGER",
  model: AGENT_MODEL,
  maxTokens: 4096,
  maxIterations: 8,
  promptFile: "triage.md",
});

registerAgent({
  id: "reconciliation",
  description:
    "Explains CashRecord gaps between sales and collection; flags fraud patterns.",
  triggers: ["cash_record_upserted", "cron"],
  actorRole: "ACCOUNTANT",
  model: AGENT_MODEL,
  maxTokens: 3072,
  maxIterations: 6,
  promptFile: "reconciliation.md",
});

registerAgent({
  id: "narrator",
  description:
    "Produces hourly ops briefings from clustered alerts and violations.",
  triggers: ["cron"],
  actorRole: "OPS_MANAGER",
  model: AGENT_MODEL,
  maxTokens: 2048,
  maxIterations: 4,
  promptFile: "narrator.md",
});

registerAgent({
  id: "chat",
  description:
    "Conversational Ask Darb surface. Reactive to user messages in the Cmd+K palette.",
  triggers: [], // reactive only — never triggered by events or cron
  actorRole: "OPS_MANAGER",
  model: AGENT_MODEL,
  maxTokens: 4096,
  maxIterations: 5,
  promptFile: "chat.md",
});

// Phase 2 Wave 1 — REQ-agent-continuous-monitoring + REQ-agent-action-drafting +
// REQ-agent-propose-confirm. The monitor agent runs on a tiered cron cadence
// (1m hot, 15m warm, 1h cold; see scheduler.ts). It scans tenant data via the
// 12 read tools, consults dismissed:* AgentMemory rows for 7-day suppression,
// applies a per-tenant rate limit (50 proposals/day per orchestrator decision
// #3), and PROPOSES — never executes — write actions through the registry's
// approval gate. Every write-tool invocation enqueues a PendingAgentAction
// row that the design partner reviews and confirms. T-02-01 is enforced in
// runtime.ts: the monitor's ToolContext never carries a userId.
registerAgent({
  id: "monitor",
  description:
    "Continuous monitoring loop for the Decisions Surface. Tier-aware (hot 1m, warm 15m, cold 1h) — scans live fleet status, recent rejections, attendance, cash gaps, and weekly performance trends. Drafts WhatsApp/SMS/IN_APP courier messages and review flags via the propose-and-confirm contract; never executes side effects autonomously. Consults dismissed:* AgentMemory rows for 7-day suppression and stops at 50 proposals/tenant/day.",
  triggers: ["cron"],
  actorRole: "OPS_MANAGER",
  model: AGENT_MODEL,
  maxTokens: 4096,
  maxIterations: 10,
  promptFile: "monitor.md",
});

// Phase 3 Wave 1 — REQ-agent-scoring. Single-shot explainer producing 2-4
// sentences of plain-English score commentary. No tool-loop (maxIterations=3
// gives the model 1 generation + 1 retry budget if it violates the format),
// tight maxTokens to cap cost. Wave 1 wires explainScore() to invoke this
// agent on cache miss. The prompt at prompts/scoreExplainer.md forbids action
// verbs (warn/suspend/etc.) to keep the explainer a read-only narrative.
registerAgent({
  id: "score-explainer",
  description:
    "Generates 2-4 sentence plain-English explanations of a courier's composite performance score. Read-only narrative — never proposes actions. Cost-capped: single-shot, maxTokens=512.",
  triggers: [],
  actorRole: "OPS_MANAGER",
  model: AGENT_MODEL,
  maxTokens: 512,
  maxIterations: 3,
  promptFile: "scoreExplainer.md",
});

// Register tools for each agent.
registerTriageTools();
registerReconciliationTools();
registerNarratorTools();

// Phase 1 Wave 3 — register the 11 PRD read tools (REQ-agent-read-tools).
// The `tools/read/` index module side-effect-imports every tool file, each of
// which self-registers; calling registerAllReadTools is a no-op shim today
// but kept as the explicit registration surface for future waves.
//
// Phase 2 Wave 1 — adds the 12th read tool (listAgentMemory) via the same
// side-effect import in tools/read/index.ts.
registerAllReadTools();

// Phase 2 Wave 1 — register the 3 propose tools (REQ-agent-action-drafting).
// The tools/action/index.ts module side-effect-imports each tool file:
//   draftCourierMessage  (LIVE — sends Notification after Confirm)
//   flagForReview        (audit-only — Wave 2 approve route writes AgentAction)
//   proposeCashReminder  (audit-only — Phase 8 wires to live Cash Workbench)
import "./tools/action";

// Phase 4 Wave 1 — register describeView for the chat agent (allowedAgents=["chat"]).
// The chat agent emits structured UI envelopes through this tool; the runtime's
// streaming wrapper collects them on RunAgentResult.views.
import "./tools/view";

// Re-export the common entry points.
export { runAgent, registerAgent, getAgent, listAgents } from "./runtime";
export { toolRegistry } from "./registry";
export type { AgentDefinition, AgentId, RunAgentInput, RunAgentResult } from "./runtime";
export type { ToolDefinition, ToolContext, ToolSideEffect, InvokeResult } from "./registry";

// ─── Phase 1 Wave 2 — Data primitives ─────────────────────────────────────
// REQ-data-agent-action: writeAgentAction (CON-audit-row-shape ledger writer)
// REQ-data-agent-memory: upsertAgentMemory + latestMemoryByKey + listMemoriesByPrefix
// REQ-data-pinned-view:  createPinnedView + listPinsForUser + removePinnedView
// REQ-data-metric-event: recordMetricEvent
// REQ-data-performance-snapshot: writePerformanceSnapshot + listSnapshotsForDriver
export { writeAgentAction } from "./ledger";
export type { AuditRow } from "./ledger";
export {
  upsertAgentMemory,
  latestMemoryByKey,
  listMemoriesByPrefix,
} from "./memory";
export type { MemoryEntry, MemoryRecord, MemorySource } from "./memory";
export {
  createPinnedView,
  listPinsForUser,
  removePinnedView,
} from "./pinnedView";
export type {
  PinnedViewSpec,
  PinnedViewRecord,
  PinnedViewType,
} from "./pinnedView";
export { recordMetricEvent } from "./metricEvent";
export type { MetricEventInput } from "./metricEvent";
export {
  writePerformanceSnapshot,
  listSnapshotsForDriver,
} from "./performanceSnapshot";
export type {
  PerformanceSnapshotInput,
  ScoreTrend,
} from "./performanceSnapshot";
