# Phase 12: Owner-Authored Standing Rules + Forecasting — Research

**Researched:** 2026-05-13
**Domain:** Rule-engine schema/evaluation, demand forecasting (exponential smoothing + DOW seasonality), per-tenant cron fan-out, v2 closeout (LOCKED decisions ratification + production deploy + design-partner-2 onboarding)
**Confidence:** HIGH

## Summary

Phase 12 is the **closing phase** of the v2 pivot and ships two big-feature surfaces plus a final-mile delivery cycle (LOCKED decisions ratification + design-partner-2 onboarding + production deploy). The two feature surfaces are (a) `StandingRule` — owner-authored "if X then propose Y" rules backed by the already-empty Phase 1 `AgentRule` model, and (b) forecasting — demand-by-DOW×hour, courier-pool sizing, and a 30/60/90-day cash flow projection. Neither feature requires new infrastructure; both ride primitives the prior eleven phases shipped (BullMQ `JobScheduler`, the `ToolRegistry` `requiresApproval` gate, `MetricEvent` analytics, Phase 11's trust-graduation hooks, the existing event bus). The forecasting side stays deliberately math-light: no `tensorflow`, no `prophet`, no time-series library — just `OrderLog` / `Shift` `groupBy` aggregates plus 50-line exponential-smoothing helpers in TypeScript.

The dominant architectural decision is **rule storage shape**: a custom mini-DSL vs. a structured JSON object. Recommended for v1 is **structured JSON** (`{ when: { event, where, threshold }, then: { tool, params }, throttle }`), evaluated by a hand-rolled `RuleEvaluator` rather than `json-logic-js`. The reasons are (1) the rule surface is small (~10 event types × ~10 action tools, not a general expression language), (2) the agent's existing Zod input-validators on action tools become the rule's parameter schema for free, (3) a DSL invites edge-case bugs and Phase 2's editable-params allow-list already proves owners want a constrained surface, not a programming language, and (4) JsonLogic's `var` accessor pattern still leaks the underlying event shape to owners — the structured form lets the rule builder render Shadcn form components keyed off `editableParams` per the agent tool already.

The dominant evaluation pattern is **hybrid event + cron**: most rules fire on the existing `DarbEventType` (`violation`, `cash_record_upserted`, `agent_action_resolved`, etc.) the same way the monitor agent already subscribes; aggregate rules ("3 lates in a week") fire on a daily 06:00 cron tick that scans the last 7 days. The cron-evaluated subset is identified by `rule.when.aggregateWindow != null` and runs in a single `standingRulesCronWorker.ts` BullMQ job that reuses Phase 11's `JobScheduler` pattern.

Forecasting splits into three independent calculators, all readable in <300ms via two existing indexes (`OrderLog.tenantId+date+platform` and `Shift.tenantId+scheduledStart`): `forecastDemand` (Holt-Winters-lite triple-exponential smoothing over 8-12 weeks of `OrderLog.orderCount` aggregated by `date_trunc('hour', date) × dow`), `forecastSupplyGap` (compares predicted demand to scheduled `Shift` hours in the same hour-bucket), `forecastCashFlow` (linear regression on `KeetaDailyMetrics + TalabatDailyMetrics + DeliverooDailyMetrics` revenue trend minus `Expense` trend, projected forward 30/60/90 days). All three surface as new agent read-tools (`forecastDemand`, `forecastSupplyGap`, `forecastCashFlow`) — REQ-agent-read-tools deferred the first two for exactly this phase.

**Primary recommendation:** Build in four sequential waves. Wave 0 lands the test scaffolding + the additive `AgentRule` schema extension + tenant-scope guard extension. Wave 1 ships the rule evaluation engine (structured JSON + hand-rolled evaluator) + the three forecasting tools. Wave 2 ships the `/rules` and `/forecast` frontend pages. Wave 3 closes out v2: ratifies the 5 LOCKED decisions in PROJECT.md, runs the final verification pass, deploys to production, and seeds design-partner-2.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| StandingRule storage | API / Backend (Prisma) | — | New model `AgentRule` extended with `name + condition Json + action Json + throttle Json + enabled` columns; tenant-scoped |
| Rule evaluation on event | API / Backend (services/standingRules/) | — | Subscribe to existing `eventBus.subscribe(tenantId)`; identical pattern to `agent/scheduler.ts` |
| Rule evaluation on cron (aggregate rules) | API / Backend Worker | — | `queues/standingRulesCronWorker.ts` runs daily 06:00 Kuwait per tenant; BullMQ `JobScheduler` |
| Rule firing → proposes via existing tool | API / Backend (registry.ts) | — | `toolRegistry.invoke()` with synthetic ctx (no `userId`) → enqueues `PendingAgentAction` exactly like the monitor agent does today |
| Rule builder UI | Frontend | API | `/rules` page; rule editor reads the agent tool registry via `GET /api/agent/tools/schema` for the `then.params` form; Shadcn `Card + Select + Input + Switch` primitives |
| Rule test mode (preview last-7-days matches) | Frontend + API | — | `POST /api/rules/:id/dry-run` replays last-7-days events through evaluator-in-dry-run-mode; returns hypothetical match count + sample matches |
| forecastDemand calculation | API / Backend (services/forecasting/) | — | Pure TypeScript math over `OrderLog` groupBy aggregates |
| forecastSupplyGap calculation | API / Backend (services/forecasting/) | — | Joins forecastDemand output with `Shift` scheduled-hours rollup |
| forecastCashFlow calculation | API / Backend (services/forecasting/) | — | Linear regression on `*DailyMetrics` revenue + `Expense` trend |
| Forecast surfaces (visualisation) | Frontend | API | `/forecast` page; per-platform dashboard tabs in existing pages; charts via Recharts (already shipped Phase 4) |
| Morning briefing forecast injection | API / Backend (agent/prompts/) | — | Extend `briefing-owner.md` system prompt (Phase 11) with `forecastDemand` + `forecastSupplyGap` tool calls; no new infra |
| LOCKED decisions ratification | Documentation (PROJECT.md) | — | PROJECT.md edit: promote 5 master-gate `proposed` rows to `LOCKED`; one MD commit |
| Production deploy + verification | Operations | — | `vercel --prod --yes` from `frontend/` + `backend/` per user feedback memory; verify both deploys healthy |
| Design partner #2 onboarding | Operations + Frontend | — | Re-run the Phase 2 `/admin/onboarding` wizard against the second tenant; same 8-step dry-run |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 5.22.0 | `AgentRule` schema extension; raw aggregate query for `OrderLog.groupBy({ by: ['date'], _sum })` | Already canonical [VERIFIED: backend/package.json] |
| BullMQ | 5.73.4 | `standingRulesCronWorker` daily 06:00 tick + `forecastWarmupWorker` weekly refresh | Already in package.json; Phase 4 + Phase 11 already use `JobScheduler` for this exact pattern [VERIFIED: backend/package.json] |
| ioredis | 5.4.1 | Per-rule throttle counters (e.g., "fire at most 1×/day per driver") via sorted-set sliding-window-log | Already in use [VERIFIED: backend/package.json] |
| zod | 3.23.8 | `StandingRule.condition` + `.action` Json validation; per-event payload shape per `DarbEventType` | Already canonical for tool inputValidator [VERIFIED: backend/package.json] |
| @anthropic-ai/sdk | 0.80.0 | (Optional) "Natural-language rule" extractor — owner types "warn drivers late 3+ times this week" → JSON rule | Already wired; Phase 12 only uses for the NL→structured conversion path |
| Recharts | 3.8.1 | Forecast line charts on `/forecast` page (demand projection, cash flow 30/60/90) | Already shipped in Phase 3 + Phase 4 [VERIFIED: frontend/package.json] |
| Shadcn/ui (cmdk, dialog, form, switch) | latest | Rule builder UI primitives | Already shipped via Phase 4 cmdk install [VERIFIED: frontend/package.json] |
| date-fns | (Node 22 built-in `Intl.DateTimeFormat`) | DOW × hour bucket math (Asia/Kuwait timezone) | Codebase pattern: use `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kuwait' })` rather than introducing date-fns; Kuwait does not observe DST [VERIFIED: Phase 11 RESEARCH §Pitfall 7 already used this pattern] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-cron | 4.2.1 | (Not used — already replaced by BullMQ JobScheduler in Phase 4) | Listed for context only; do NOT add new node-cron jobs in Phase 12 |
| `crypto` (Node built-in) | n/a | Rule fingerprinting (deterministic hash of condition+action JSON) for idempotency | Use for `lastFireKey = hash(ruleId + subjectId + dayBucket)` throttle keys |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Structured JSON `{ when, then, throttle }` | DSL mini-language (e.g., `"driver.lateCount(7d) >= 3 then propose suspendDriver"`) | DSL is more terse but invites parser bugs and forces a custom editor. Structured JSON forms naturally pair with Shadcn form components and the agent tool registry's existing `editableParams` allow-list. **Recommend structured.** |
| Structured JSON evaluated by JsonLogic | Hand-rolled `RuleEvaluator` | JsonLogic gives you `>`, `<`, `and`, `or` for free — but the rule surface is small (~12 condition shapes) and JsonLogic's `var` accessor leaks event shape to owners. **Recommend hand-rolled** evaluator dispatching on `rule.when.event` and `rule.when.aggregateWindow`. |
| Hold-Winters-lite exponential smoothing | ARIMA via `pyodide` or `prophet-js` | Owner-visible forecasts need stability and explainability, not accuracy chasing. A 3-component HW (level/trend/season) is ~80 lines of TS and explains every prediction as `level + trend + seasonal[hour]`. **Recommend HW-lite.** |
| Postgres `date_trunc('hour', date)` raw SQL | Prisma `groupBy({ by: ['date'] })` + in-memory hour-bucket | `OrderLog.date` is already truncated to day-precision (the column is `DateTime` but per-driver-per-day aggregate). True hourly demand requires `OrderEvent.timestamp` (Phase 1 model) — switch source for hourly granularity. **Use `OrderEvent.timestamp` + raw `$queryRaw` `date_trunc('hour', "timestamp" AT TIME ZONE 'Asia/Kuwait')`** for forecastDemand. |
| Single `AgentRule` model | Split `AgentRule` + `AgentRuleFiring` (audit table) | Audit data lives in existing `AgentAction` (`source` already supports `"rule"` per Phase 11 lineage — extend the column's enum-in-comments). **Recommend single `AgentRule` table + audit via existing `AgentAction.source = "rule"`** + new `AgentAction.ruleId` foreign key. |
| Run forecast warmup on every tool call | Nightly worker that caches forecast outputs per tenant | Forecast math is cheap (<300ms) but Anthropic-driven briefings will read forecasts 6+ times/morning during fan-out. **Cache the forecast output** in `AgentMemory` with `key='forecast:demand:YYYY-MM-DD'` + 24h TTL by `source='cached_forecast'`. Reuse Phase 11's memory pruning exemption for `source IN ('founder_pinned', 'user_correction')` — `cached_forecast` is fair game for pruning since it regenerates daily. |

**Installation:** No new dependencies. All libraries already in `backend/package.json` and `frontend/package.json`.

**Version verification:**
```bash
cd /Users/mac/Documents/Darb/backend && npm ls bullmq @anthropic-ai/sdk @prisma/client zod
# bullmq@5.73.4
# @anthropic-ai/sdk@0.80.0
# @prisma/client@5.22.0
# zod@3.23.8
cd /Users/mac/Documents/Darb/frontend && npm ls recharts cmdk
# recharts@3.8.1
# cmdk@1.1.1
```
All four backend libs and both frontend libs are already pinned; no `npm install` required to start Phase 12.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Phase 12 — runtime view (rules + forecasting)               │
└──────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────┐   tenant event published by upstream service
  │ eventBus.publish(      │ ──────────────────┐
  │   tenantId, {          │                   │
  │   type: 'violation',   │                   ▼
  │   payload: {...}})     │   ┌────────────────────────────────────────┐
  └────────────────────────┘   │ standingRulesEventListener.ts (NEW)    │
                               │  subscribe per-tenant (one per tenant) │
                               │  on event:                              │
                               │    1. SELECT enabled rules WHERE        │
                               │       tenantId AND condition.event=     │
                               │       event.type AND                    │
                               │       aggregateWindow IS NULL           │
                               │    2. for each matching rule:           │
                               │       evaluator.evaluate(rule, event)  │
                               │    3. if matches:                       │
                               │       - check throttle (redis)          │
                               │       - toolRegistry.invoke(rule.then  │
                               │         .tool, syntheticCtx, params)  │
                               │       - writes PendingAgentAction       │
                               │         (existing path) + AgentAction   │
                               │         row with source='rule', ruleId  │
                               └────────────────────────────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────────┐
                               │ ToolRegistryImpl.invoke()              │
                               │  (registry.ts:120, EXISTING)           │
                               │  requiresApproval=true && !userId      │
                               │  → stages PendingAgentAction           │
                               │  → appears in /decisions inbox         │
                               └────────────────────────────────────────┘


  ┌────────────────────────┐  daily 06:00 Asia/Kuwait
  │ BullMQ JobScheduler    │ ──────────────────┐
  │ (scheduler id =        │                   │
  │  "standing-rules-cron" │                   ▼
  │  + tenantId)           │   ┌────────────────────────────────────────┐
  └────────────────────────┘   │ standingRulesCronWorker.ts (NEW)       │
                               │  SELECT enabled rules WHERE             │
                               │    tenantId AND aggregateWindow ≠ NULL │
                               │  for each rule:                         │
                               │    aggregateEvaluator.evaluate(rule)    │
                               │    (queries last N days of evidence)    │
                               │    if matches per-driver/per-zone:      │
                               │      throttle check + toolRegistry      │
                               │      .invoke(...) → PendingAgentAction  │
                               └────────────────────────────────────────┘


  ┌────────────────────────┐  agent.runAgent('chat') wants forecast
  │  agent runtime         │ ──────────────────┐
  │  (briefing or chat)    │                   │
  └────────────────────────┘                   ▼
                               ┌────────────────────────────────────────┐
                               │ tool: forecastDemand (NEW read tool)   │
                               │  1. Check AgentMemory                   │
                               │     key='forecast:demand:YYYY-MM-DD'    │
                               │  2. Hit → return cached                 │
                               │  3. Miss →                              │
                               │     a. $queryRaw OrderEvent.timestamp   │
                               │        grouped by hour×dow over 8 weeks │
                               │     b. holtWintersTriple(series) →      │
                               │        { dow, hour, predicted, ci90 }   │
                               │     c. write AgentMemory cache row      │
                               │     d. return forecast                  │
                               └────────────────────────────────────────┘


  ┌────────────────────────┐   user opens /rules → POST /api/rules/:id/dry-run
  │ /rules frontend page   │ ──────────────────┐
  │ (rule builder)         │                   │
  └────────────────────────┘                   ▼
                               ┌────────────────────────────────────────┐
                               │ POST /api/rules/:id/dry-run             │
                               │  - Replay last 7 days of relevant       │
                               │    eventBus events from AgentAction +   │
                               │    Violation + CashRecord tables        │
                               │  - evaluator.evaluate(rule, event) in   │
                               │    dryRun=true mode (no toolRegistry    │
                               │    .invoke, no PendingAgentAction)      │
                               │  - return [{ ts, subjectId, would      │
                               │    Fire: true|false, sample }]          │
                               └────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/src/
├── services/
│   ├── standingRules/                  # NEW directory
│   │   ├── types.ts                    # StandingRuleCondition, StandingRuleAction, StandingRuleThrottle (Zod)
│   │   ├── evaluator.ts                # evaluate(rule, event) → boolean + match metadata
│   │   ├── aggregateEvaluator.ts       # evaluate(rule) → array of subject matches (for cron-evaluated rules)
│   │   ├── eventListener.ts            # subscribe(tenantId) + dispatch matching rules
│   │   ├── throttle.ts                 # Redis sliding-window-log throttle check
│   │   ├── dryRunService.ts            # replay-last-7-days harness for /rules/:id/dry-run
│   │   └── catalog.ts                  # 6 default rule templates ("3 lates → suspension", etc.)
│   └── forecasting/                    # NEW directory
│       ├── types.ts                    # ForecastResult, DemandSeries, CashFlowProjection
│       ├── holtWinters.ts              # ~80-line triple-exponential smoothing (level/trend/season)
│       ├── demand.ts                   # forecastDemand(tenantId, zone?, hourBucket?, weeks?)
│       ├── supplyGap.ts                # forecastSupplyGap(tenantId, zone?, hourBucket?)
│       └── cashFlow.ts                 # forecastCashFlow(tenantId, horizonDays=30|60|90)
├── agent/
│   ├── tools/read/
│   │   ├── forecastDemand.ts           # NEW agent read tool — REQ-agent-read-tools
│   │   ├── forecastSupplyGap.ts        # NEW agent read tool
│   │   └── forecastCashFlow.ts         # NEW agent read tool
│   └── prompts/
│       └── briefing-owner.md           # EXTENDED: now references forecastDemand + forecastSupplyGap
├── queues/
│   ├── standingRulesCronWorker.ts      # NEW: daily 06:00 Asia/Kuwait per tenant
│   └── forecastWarmupWorker.ts         # NEW (optional): weekly cache pre-warm on Sunday 03:00
└── routes/
    └── rules.ts                        # NEW: /api/rules CRUD + /:id/dry-run + /templates

frontend/src/app/
└── (dashboard)/
    ├── rules/                          # NEW page
    │   ├── page.tsx                    # /rules — list of standing rules
    │   ├── [id]/page.tsx               # /rules/[id] — rule editor (visual + JSON tabs)
    │   └── new/page.tsx                # /rules/new — start from blank or template
    └── forecast/                       # NEW page
        ├── page.tsx                    # /forecast — demand × supply × cash flow tabs
        ├── DemandForecastChart.tsx     # Recharts line + DOW heatmap
        ├── SupplyGapPanel.tsx          # red/amber zones with hourly shortfall
        └── CashFlowProjection.tsx      # 30/60/90 day P&L projection
```

### Pattern 1: Structured-JSON rule shape with tool-registry-driven param schema

**What:** Each `StandingRule` row stores `condition Json` and `action Json` matching this Zod shape:
```typescript
// Source: backend/src/services/standingRules/types.ts (new)
const StandingRuleCondition = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("attendance_late"),
    aggregateWindow: z.object({ days: z.number().int().min(1).max(30) }).nullable(),
    threshold: z.object({ minCount: z.number().int().min(1) }),
    where: z.object({
      driverPlatform: z.enum(["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"]).optional(),
      driverZone: z.string().optional(),
    }).optional(),
  }),
  z.object({
    event: z.literal("violation"),
    aggregateWindow: z.object({ days: z.number().int().min(1).max(30) }).nullable(),
    threshold: z.object({ minCount: z.number().int().min(1), severity: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional() }),
    where: z.object({ violationType: z.string().optional() }).optional(),
  }),
  z.object({
    event: z.literal("cash_overdue"),
    aggregateWindow: z.object({ days: z.number().int().min(1).max(30) }),
    threshold: z.object({ minDays: z.number().int().min(1), minAmountKd: z.number().min(0) }),
  }),
  z.object({
    event: z.literal("gps_stale"),
    aggregateWindow: z.null(),  // realtime — no window
    threshold: z.object({ minMinutes: z.number().int().min(5).max(60) }),
  }),
  // 6 more event types map to existing DarbEventType + Phase 8 action triggers
]);

const StandingRuleAction = z.object({
  tool: z.enum(["draftCourierMessage", "applyPenalty", "suspendDriver", "flagForReview", "createTrainingTask", "escalateToHumanSupervisor"]),
  params: z.record(z.unknown()),  // validated against the tool's own inputValidator at evaluation time
  // The params object is shaped per the tool's editableParams allow-list from registry.ts
});

const StandingRuleThrottle = z.object({
  perSubject: z.object({ window: z.enum(["1h","1d","7d"]), max: z.number().int().min(1) }).optional(),
  perTenant: z.object({ window: z.enum(["1h","1d"]), max: z.number().int().min(1) }).optional(),
}).optional();
```

**When to use:** Anytime an owner can author a rule. The structured shape pairs naturally with the agent's existing `editableParams` allow-list — the rule builder renders a Shadcn form whose fields are exactly what the agent already allows humans to edit on a proposal card.

**Example:** "3 lates in a week → propose suspension"
```json
{
  "name": "Three-strike late absence",
  "condition": {
    "event": "attendance_late",
    "aggregateWindow": { "days": 7 },
    "threshold": { "minCount": 3 }
  },
  "action": {
    "tool": "suspendDriver",
    "params": { "durationDays": 3, "reason": "Repeated late starts (3+ in 7 days, auto-detected by Darb)" }
  },
  "throttle": { "perSubject": { "window": "7d", "max": 1 } }
}
```

### Pattern 2: Event-listener wave + cron-tick wave (hybrid evaluation)

**What:** Realtime rules (`aggregateWindow: null`) wire to `eventBus.subscribe` exactly as `agent/scheduler.ts` does (line 78-83). Aggregate rules (`aggregateWindow ≠ null`) execute on a daily 06:00 Asia/Kuwait BullMQ tick that scans the last N days of state.

**When to use:** Always — never run "3 lates in a week" on every `attendance_late` event (you'd do 3 redundant DB queries per arrival). Conversely, never run "GPS stale" on a cron (you want immediate notification, not "we noticed at 06:00 tomorrow").

**Example:**
```typescript
// Source: backend/src/services/standingRules/eventListener.ts (new)
import { subscribe } from "../eventBus";
import { evaluator } from "./evaluator";
import { invokeRuleAction } from "./invoker";

export function startStandingRulesListener(tenantId: string) {
  return subscribe(tenantId, async (event) => {
    // Skip events we know aren't rule-triggers (cheap pre-filter)
    if (!RELEVANT_EVENT_TYPES.has(event.type)) return;

    // Realtime rules only — aggregate rules handled by cron worker
    const rules = await prisma.agentRule.findMany({
      where: {
        tenantId,
        enabled: true,
        // condition.event = event.type AND condition.aggregateWindow IS NULL
        // Postgres JSON path query via Prisma:
        //   condition: { path: ["event"], equals: event.type }
        //   condition: { path: ["aggregateWindow"], equals: null }  -- NB: null != absent
      },
    });
    const matchingRules = rules.filter(r => r.condition.event === event.type && r.condition.aggregateWindow == null);

    for (const rule of matchingRules) {
      const match = evaluator.evaluate(rule.condition, event);
      if (match.matches) {
        await invokeRuleAction(rule, match.subjectId, match.subjectType, event);
      }
    }
  });
}

// Source: backend/src/queues/standingRulesCronWorker.ts (new)
// Pattern follows scheduledBriefingsWorker.ts (Phase 4 reference)
async function processCronTick(tenantId: string) {
  const rules = await prisma.agentRule.findMany({
    where: { tenantId, enabled: true },
  });
  const aggregateRules = rules.filter(r => r.condition.aggregateWindow != null);
  for (const rule of aggregateRules) {
    const matches = await aggregateEvaluator.evaluate(rule);  // returns [{ subjectId, subjectType, evidence }]
    for (const m of matches) {
      const throttled = await isThrottled(rule.id, m.subjectId, rule.throttle);
      if (throttled) continue;
      await invokeRuleAction(rule, m.subjectId, m.subjectType, { tenantId, type: "aggregate_tick", payload: m.evidence });
    }
  }
}
```

### Pattern 3: Triple-exponential smoothing (Holt-Winters-lite) for demand forecasting

**What:** ~80 lines of TypeScript that compute level (α), trend (β), and seasonal (γ) components over a series of hourly demand observations. Period = 168 (24 hours × 7 days) for weekly seasonality, or 24 for daily seasonality.

**When to use:** `forecastDemand(tenantId, zone?, hourBucket?, weeks=8)` — fits the model on the last 8 weeks of `OrderEvent` aggregated by hour, projects forward 7 days.

**Example:**
```typescript
// Source: backend/src/services/forecasting/holtWinters.ts (new)
// Reference: Hyndman & Athanasopoulos, Forecasting: Principles and Practice (otexts.com/fpp3/holt-winters.html)
// (citation kept generic — using the well-known multiplicative HW formula, not a library import)

export function holtWintersTriple(
  series: number[],
  period: number,
  alpha: number = 0.3,
  beta: number = 0.05,
  gamma: number = 0.2,
  forecastHorizon: number = 168
): { fitted: number[]; forecast: number[]; ci90: { lower: number[]; upper: number[] } } {
  const n = series.length;
  if (n < 2 * period) throw new Error(`Need ≥ 2 periods (${2 * period} points) for HW`);

  // Initialise level = mean of first period
  let level = series.slice(0, period).reduce((a, b) => a + b, 0) / period;
  // Initialise trend = (avg of 2nd period - avg of 1st period) / period
  const period2Avg = series.slice(period, 2 * period).reduce((a, b) => a + b, 0) / period;
  let trend = (period2Avg - level) / period;
  // Initialise seasonals = each first-period observation / level
  const seasonals: number[] = series.slice(0, period).map(v => (level ? v / level : 1));

  const fitted: number[] = [];
  for (let t = 0; t < n; t++) {
    const s = seasonals[t % period];
    const forecast = (level + trend) * s;
    fitted.push(forecast);
    if (t >= period) {
      const value = series[t];
      const prevLevel = level;
      level = alpha * (value / s) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonals[t % period] = gamma * (value / level) + (1 - gamma) * s;
    }
  }

  const forecast: number[] = [];
  for (let h = 1; h <= forecastHorizon; h++) {
    forecast.push((level + h * trend) * seasonals[(n + h - 1) % period]);
  }

  // 90% CI = forecast ± 1.645 × residual stddev (simple approximation, not bootstrap)
  const residuals = fitted.map((f, i) => series[i] - f).slice(period);
  const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const sd = Math.sqrt(residuals.reduce((a, b) => a + (b - meanRes) ** 2, 0) / residuals.length);
  const z = 1.645;
  return {
    fitted,
    forecast,
    ci90: {
      lower: forecast.map(f => Math.max(0, f - z * sd)),
      upper: forecast.map(f => f + z * sd),
    },
  };
}
```

**Why these defaults:** α=0.3 (moderate level smoothing — Kuwait fleet demand doesn't drift fast), β=0.05 (slow trend — week-to-week growth is small), γ=0.2 (seasonal updates moderately — Ramadan / holidays do shift patterns). These match the Holt-Winters defaults recommended in Hyndman §8.3 for "demand with stable seasonal pattern."

### Pattern 4: Cached forecast in AgentMemory with daily key

**What:** Cache `forecastDemand` output in `AgentMemory` with `key = "forecast:demand:YYYY-MM-DD"` and `value = { forecast, ci90, computedAt }`. The agent read tool checks for today's row first; on miss, computes fresh and writes the cache row.

**When to use:** Whenever a forecast is read more than once per day per tenant (which is always — briefing, chat, /forecast page all read it).

**Example:**
```typescript
// Source: backend/src/agent/tools/read/forecastDemand.ts (new)
export const forecastDemand = defineTool({
  name: "forecastDemand",
  description: "Return predicted hourly demand for the next 7 days, by zone × hour-of-week. Uses 8-week history. Tenant-scoped. Cached for 24h.",
  inputSchema: { /* ... */ },
  inputValidator: z.object({
    zone: z.string().optional(),
    horizonHours: z.number().int().min(24).max(336).default(168),
  }),
  strict: true, sideEffect: "read", requiredRole: ["ADMIN","OPS_MANAGER","ACCOUNTANT","VIEWER"], requiresApproval: false, allowedAgents: ["*"],
  async execute(ctx, input) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `forecast:demand:${input.zone ?? "ALL"}:${today}`;
    const cached = await latestMemoryByKey(ctx.tenantId, cacheKey);
    if (cached && cached.source === "cached_forecast") return cached.value;

    const series = await fetchHourlyOrderSeries(ctx.tenantId, input.zone, 8);
    const result = holtWintersTriple(series, 168, 0.3, 0.05, 0.2, input.horizonHours);
    await prisma.agentMemory.create({
      data: { tenantId: ctx.tenantId, key: cacheKey, value: result as any, source: "cached_forecast", confidence: 0.7 },
    });
    return result;
  },
});
```

### Pattern 5: Rule dry-run via 7-day event replay

**What:** `POST /api/rules/:id/dry-run` replays the last 7 days of relevant rows from `Violation`, `AttendanceRecord`, `CashRecord`, `AgentAction` tables through the evaluator in `dryRun=true` mode (no `toolRegistry.invoke`, no `PendingAgentAction` writes). Returns hypothetical matches.

**When to use:** Owner clicks "Test rule" on the rule builder before saving.

**Example:**
```typescript
// Source: backend/src/services/standingRules/dryRunService.ts (new)
export async function dryRunRule(rule: StandingRule, tenantId: string): Promise<DryRunMatch[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  let candidates: ReplayEvent[];
  switch (rule.condition.event) {
    case "violation":
      candidates = (await prisma.violation.findMany({
        where: { tenantId, violationTime: { gte: sevenDaysAgo } },
      })).map(v => ({ ts: v.violationTime, type: "violation", payload: v, subjectId: v.driverId, subjectType: "Driver" }));
      break;
    case "attendance_late":
      candidates = (await prisma.attendanceRecord.findMany({
        where: { tenantId, scheduledStart: { gte: sevenDaysAgo }, isLate: true },
      })).map(a => ({ ts: a.scheduledStart, type: "attendance_late", payload: a, subjectId: a.driverId, subjectType: "Driver" }));
      break;
    // … 6 more cases
  }

  // For aggregate rules, group by subject and apply threshold; for realtime, evaluate per-event
  if (rule.condition.aggregateWindow) {
    return groupAndApplyThreshold(rule, candidates);
  }
  return candidates
    .map(ev => ({ ts: ev.ts, subjectId: ev.subjectId, wouldFire: evaluator.evaluate(rule.condition, ev).matches, sample: ev.payload }))
    .filter(m => m.wouldFire);
}
```

### Anti-Patterns to Avoid

- **Don't build a DSL.** Owners are not programmers. A DSL forces a custom parser, a custom editor, and ten new edge-case bugs. The structured JSON in Pattern 1 gives Shadcn form components for free. (The "natural language → JSON rule" path *can* use Claude as an extractor — that's a separate optional enhancement, not the storage format.)
- **Don't evaluate aggregate rules on every event.** "3 lates in 7 days" should NOT fire a Postgres aggregate query on every `attendance_late` event. Use the cron-tick path (Pattern 2) for aggregate rules.
- **Don't bypass the existing approval gate.** Phase 12 rule firing routes through `toolRegistry.invoke()` with `userId = undefined` — exactly the same as the monitor agent — so the existing `requiresApproval` gate stages a `PendingAgentAction`. **The owner approves rule-fired proposals the same way they approve monitor-fired proposals.** Trust graduation (Phase 11) decides whether rule firings auto-execute — Phase 12 doesn't change that logic.
- **Don't load a forecasting library.** `tensorflow.js`, `prophet-js`, `simple-statistics` — all bigger than the 80-line Holt-Winters implementation and harder to explain in the morning briefing. Math should be inline so the briefing can say "level=120, trend=+2/day, seasonal[fri-18h]=1.4."
- **Don't run forecasts inline on every page load.** The 8-week-of-OrderEvent query is fast but not free at 6+ tenants. Cache in `AgentMemory` per Pattern 4.
- **Don't surface auto-fired rule actions in the main `/decisions` inbox without a tag.** A rule fired action looks like any other proposal but the owner needs to know "this came from your rule" so they can edit the rule, not just the proposal. Tag `PendingAgentAction.source = "rule:${ruleId}"` and surface a "Edit rule" link on the card.
- **Don't forget to backfill the `AgentRule` model from Phase 1.** Phase 1 added the model placeholder (REQ-data-agent-rule). Phase 12 needs to *extend* it (name + condition Json + action Json + throttle Json + lastFiredAt + fireCount), not create from scratch. Verify the Phase 1 schema state before designing the migration.
- **Don't hand-roll throttle in TypeScript.** Use Redis sorted-set sliding-window-log (Phase 11 Pattern 4) — Postgres counter table with row locks blows up at 6+ tenants × N rules × M subjects.
- **Don't run cron rules at the same minute across tenants.** Same stagger pattern as Phase 11 Pitfall 4: `cron = "${hash(tenantId) % 5} 6 * * *"` so 5 tenants spread across 06:00–06:04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rule condition evaluator | Custom recursive expression interpreter | Hand-rolled `switch` over `condition.event` + Zod-validated `threshold` | 12 condition shapes, not Turing-complete. A 200-line `switch` beats a 2000-line interpreter. |
| Time-series forecasting | TensorFlow.js / prophet-js / simple-statistics | Hand-rolled Holt-Winters in ~80 lines (Pattern 3) | Explainability is more valuable than +5% accuracy. Briefing needs to say "level=120, trend=+2." |
| Cron job for rule evaluation | Custom setInterval + node-cron | BullMQ `JobScheduler` + per-tenant `upsertJobScheduler` | Phase 4 + Phase 11 reference patterns; survives restart, idempotent, observable |
| Throttling rule firings | Postgres counter table | Redis sorted-set sliding-window-log | Phase 11 Pattern 4 already proven for trust-graduation rate caps |
| Rule firing audit | Add `AgentRuleFiring` table | Extend existing `AgentAction.source="rule"` + new `ruleId` column | Audit table sprawl; `AgentAction` is already the canonical audit ledger |
| Forecast caching | Custom in-memory LRU | `AgentMemory` with daily key (Pattern 4) | Tenant-scoped + memory-pruning-compatible + queryable via existing `latestMemoryByKey` |
| Rule builder UI form generation | Custom JSON-schema-form library | Shadcn `<Form>` + `<Select>` + `<Input>` keyed off the tool's `editableParams` array | Phase 4 already uses these; the rule's `action.params` reuses tool input schema |
| Demand × hour-of-week heatmap visualisation | D3.js | Recharts `<ScatterChart>` with color-scale fill OR Tailwind grid of cells | Recharts already shipped; the heatmap is 168 cells (24×7) — render as `<div className="grid grid-cols-24 gap-1">` |
| Tenant-scoping new routes | New `tenantId` extraction | Existing `tenantScope` middleware | Already wired |
| Natural-language rule extraction | Custom parser ("late 3 times this week" → JSON) | Anthropic `messages.create` with a strict JSON-schema response format | Already wired; only used for the optional "describe the rule" input field |
| Linear regression for cash flow | New stats library | Inline `(xMean, yMean, slope, intercept)` from 50 lines of math | Same explainability story as forecastDemand |

**Key insight:** Phase 12's "new code" is mostly **glue** between primitives Phases 1–11 already shipped. The big shipping risks are (a) rule firings flood `/decisions` inbox if throttling is misconfigured, (b) forecasts are wrong-but-confident in the first 30 days for a new tenant (cold-start), and (c) the LOCKED decisions ratification slips because the design-partner-1 dry-run revealed something — Phase 12 budget needs slack for that.

## Runtime State Inventory

**Not applicable** — Phase 12 is a greenfield addition. The closest thing is the schema extension on `AgentRule` (already placeholder-scaffolded in Phase 1), which is an additive `ALTER TABLE` migration with backfill defaults — a hardened pattern in `20260510000000_decisions_billing_admin_models`.

If Phase 12 ships an OPTIONAL feature where Phase 11's `briefing-owner.md` prompt is *replaced* with one that calls `forecastDemand`, that's a content change in a markdown file with no runtime state — git is the only place the old content needs to be readable.

## Common Pitfalls

### Pitfall 1: Standing rule oscillation (rule A fires action which triggers rule B which fires action which triggers rule A)
**What goes wrong:** Owner creates rule A "if violation type=LATE_PICKUP → applyPenalty 5 KD." Owner creates rule B "if penalty applied this week → flagForReview." Penalty applied by A's `applyPenalty` fires the `cash_record_upserted` event → which fires rule B → which proposes `flagForReview` → which on approve creates a `Violation` of type `INVESTIGATION` → which fires rule A again with the same driver. The owner's `/decisions` inbox fills with the same driver in a loop.
**Why it happens:** Rules don't know about each other; the event bus carries the chain transparently.
**How to avoid:** (a) Per-subject, per-rule throttle (Pattern 1's `throttle.perSubject`) — default 1×/24h per (rule, subject) pair, configurable; (b) **chain-depth limit** in the `invokeRuleAction` helper — annotate the `PendingAgentAction` with `chainDepth` (incremented when the source event itself was emitted by an `AgentAction.source="rule"` row); reject if `chainDepth > 3`; (c) cycle detection in the rule builder UI — if rule A's action emits an event that rule B watches, surface a warning at save time.
**Warning signs:** Same `(ruleId, subjectId)` pair appears > 3 times in `AgentAction` within 24h.

### Pitfall 2: Cold-start tenant forecasting (no history)
**What goes wrong:** Design partner #2 onboards. Phase 2's 30-day backwash worker ingests the first batch. The morning briefing runs `forecastDemand` — but 8 weeks of history don't exist yet. `holtWintersTriple` throws "Need ≥ 2 periods" (line 5 of the function above).
**Why it happens:** Holt-Winters needs ≥ 2 × period = 336 observations for a 168-hour weekly cycle. Tenant has 30 days × 24 hours = 720 observations — math works. But for a tenant with only 7 days of history, it fails.
**How to avoid:** Three fallback tiers: (1) **<14 days history → no forecast**, briefing says "Forecast available after 14 days of operations"; (2) **14-56 days history → simple daily-DOW average** (no trend, no smoothing — just `mean(orderCount where dow=fri AND hour=18)` over the available history); (3) **≥56 days history → full Holt-Winters**. The `forecastDemand` tool returns `{ tier: "insufficient"|"averaged"|"hw", forecast, confidence }` so the briefing prompt can render appropriately.
**Warning signs:** Briefings for new tenants reference forecast numbers that don't exist; user reports "Darb is making numbers up."

### Pitfall 3: Forecasting noise from week-1 data (single bad day skews multipliers)
**What goes wrong:** Ramadan starts on a Tuesday this year. Tuesday demand for week 1 is 60% of normal. Holt-Winters' `seasonals[tuesday-18h] = 0.6 × baseline`. Three weeks later, Ramadan is over but the seasonal multiplier still says Tuesday is light, and the forecast is now systematically low for Tuesdays.
**Why it happens:** `gamma=0.2` is slow to update on a sustained shift; one bad week takes ~5 weeks of normal data to wash out.
**How to avoid:** (a) Surface the **seasonal multiplier explicitly** in the forecast tool output (`{ seasonals: { mon: [...24], tue: [...24], ... } }`) so the briefing can flag "Tuesday 18h forecast is 40% below recent — likely Ramadan carryover, override?"; (b) **Holiday calendar** — Tenant-level `Json` column listing known disruption windows (Ramadan, Eid, school exam season); `holtWintersTriple` accepts an `excludeDates: string[]` param and excludes those days from seasonal updates; (c) **Trim outliers** — exclude observations where `|value - fitted| > 2.5 × stddev` from seasonal updates (winsorize).
**Warning signs:** A `metricEvent.forecast_correction` from owner overrides in the briefing thread.

### Pitfall 4: Rule throttle bypass via subject-rotation
**What goes wrong:** Rule "3 lates in a week → suspend" has `throttle.perSubject.max=1/7d`. Driver A hits 3 lates, gets suspended. Same week, Driver B hits 3 lates → suspended. Same week, 8 more drivers hit 3 lates → 8 more suspensions in the inbox. Owner is overwhelmed.
**Why it happens:** Per-subject throttle prevents *repeat* suspensions of the same driver. It does nothing against firing the same rule against *different* drivers.
**How to avoid:** Add `throttle.perTenant` (already in Pattern 1) — default `{ window: "1d", max: 5 }` for high-impact tools (`suspendDriver`, `applyPenalty`). When the per-tenant cap is hit, subsequent rule firings same-day get bumped to `flagForReview` instead of the high-impact tool, with the message "Per-day cap reached; flagging for tomorrow's review."
**Warning signs:** `/decisions` inbox spikes to > 20 cards in a single tenant in < 1 hour after rule activation.

### Pitfall 5: Rule fires against deleted/inactive subject
**What goes wrong:** Driver D is offboarded; `Driver.status = INACTIVE` (or `Driver.deletedAt` set). Aggregate rule cron runs at 06:00 next day; D's last-7-days lateness still matches the threshold; rule fires `suspendDriver(D)` against an already-offboarded driver. Action proposes; owner approves out of habit; downstream code throws or the suspension is a no-op.
**Why it happens:** The aggregate evaluator queries by `tenantId + isLate=true`; it doesn't gate on driver lifecycle.
**How to avoid:** Every aggregate evaluator query MUST include `driver: { status: "ACTIVE", deletedAt: null }` (or whatever the lifecycle predicate is). Test this explicitly in Wave 0 RED tests.
**Warning signs:** `AgentAction.outcome = "failure"` rows with `errorMessage: "Driver not found"` or "Driver already suspended."

### Pitfall 6: Forecast cache key collision when zones overlap with tenant boundaries
**What goes wrong:** `forecastDemand(zone="Hawally")` cache key is `forecast:demand:Hawally:2026-05-13`. Two tenants both operate in Hawally; cache writes don't conflict because `AgentMemory` is `(tenantId, key)`-keyed. **But** an admin who switches tenant context in a debug tool sees cached forecasts from the other tenant.
**Why it happens:** `latestMemoryByKey(ctx.tenantId, key)` is tenant-scoped — this works *as designed*. The pitfall is only if someone bypasses `ctx.tenantId`.
**How to avoid:** Lint:tenant rule already catches `prisma.agentMemory.findFirst({ where: { key } })` without `tenantId`. Verify the new `forecasting/demand.ts` is added to `package.json:lint:tenant` glob.
**Warning signs:** `npm run lint:tenant` flags forecast files.

### Pitfall 7: BullMQ cron tick fires while previous tick is still running (long-running rule evaluation)
**What goes wrong:** Standing rules cron fires at 06:00. Tenant has 50 rules and 200 drivers; aggregate evaluation takes 8 minutes. Owner switches scheduled time to 06:05 in admin UI. Old job hasn't finished; new job starts; both query `AgentRule` rows; both fire the same actions twice.
**Why it happens:** BullMQ `JobScheduler` doesn't block subsequent ticks on the previous tick's completion by default. `upsertJobScheduler` schedules; `Worker` processes.
**How to avoid:** Set `Worker` concurrency to 1 for `standing-rules-cron` (one tenant at a time — the work is DB-bound, not Anthropic-bound, so parallelism doesn't buy much). Use a Redis `SETNX EX 600` idempotency key like `standing-rules:${tenantId}:${todayDate}` — if set, the worker logs "already ran" and skips. Same pattern as Phase 11 Pitfall 8.
**Warning signs:** `AgentAction.source="rule"` rows for the same `(ruleId, subjectId)` appearing twice within the same minute.

### Pitfall 8: LOCKED decisions ratification gets blocked by un-tested edge cases
**What goes wrong:** Phase 12 Wave 3 should ratify 5 master-gate decisions (DEC-pivot-framing, DEC-hide-behind-flag, DEC-propose-and-confirm-v1, DEC-pricing-target, DEC-gtm-founder-led). But propose-and-confirm has never been stress-tested by a real owner; pricing has never had a real customer reject KD 200. Wave 3 risks getting stuck because "we haven't actually validated."
**Why it happens:** PROJECT.md correctly notes the 5 decisions are master gates. Phase 12 is the natural close-out moment. But "ratification" is a documentation act; the underlying validation may not be complete.
**How to avoid:** Phase 12 Wave 3 split into two: (a) "ratify with caveats" — PROJECT.md updated with explicit notes on what each LOCKED decision is conditional on (e.g., DEC-pricing-target LOCKED at KD 2/courier/KD 200 min, *with rollback clause if 3+ design-partner conversations explicitly cite price as the blocker*); (b) actual lock happens only after design-partner-2 onboarding shows the pricing model survives a real prospect conversation. **Wave 3 may close as "5 decisions ratified-conditional"** — that's fine; the founder still owns the eventual unconditional lock.
**Warning signs:** Phase 12 Wave 3 runs > 3 days because it's waiting on customer evidence that the prior phases didn't gather.

## Code Examples

### Rule builder UI — Shadcn form keyed off agent tool registry
```typescript
// Source: frontend/src/app/(dashboard)/rules/[id]/page.tsx (new)
// Renders a Shadcn form for editing a StandingRule. The action.params section
// dynamically renders inputs based on the selected tool's editableParams.

import { useToolSchema } from "@/hooks/useToolSchema";
import { Select, Input, Switch, Card } from "@/components/ui";

export default function RuleEditor({ ruleId }: { ruleId: string }) {
  const { data: rule } = useRule(ruleId);
  const { data: tools } = useToolSchema();  // GET /api/agent/tools/schema → returns tool catalog with editableParams
  const selectedTool = tools?.find(t => t.name === rule?.action.tool);

  return (
    <Card>
      <h2>When…</h2>
      <Select value={rule?.condition.event} onChange={onChangeEvent}>
        {EVENT_OPTIONS.map(e => <option key={e}>{e}</option>)}
      </Select>

      {rule?.condition.aggregateWindow != null && (
        <Input type="number" label="Within (days)" value={rule.condition.aggregateWindow.days} />
      )}
      <Input type="number" label="Threshold (count)" value={rule.condition.threshold?.minCount} />

      <h2>Then…</h2>
      <Select value={rule?.action.tool} onChange={onChangeTool}>
        {tools?.filter(t => t.sideEffect !== "read").map(t => <option key={t.name}>{t.name}</option>)}
      </Select>

      {/* Dynamic action params per the tool's editableParams allow-list */}
      {selectedTool?.editableParams?.map(paramName => (
        <Input key={paramName} label={paramName} value={rule?.action.params[paramName]} onChange={onChangeParam(paramName)} />
      ))}

      <Switch checked={rule?.enabled} label="Enabled" />

      <button onClick={onDryRun}>Test against last 7 days</button>
      <button onClick={onSave}>Save</button>
    </Card>
  );
}
```

### Forecast tool with cold-start fallback
```typescript
// Source: backend/src/agent/tools/read/forecastDemand.ts (new)
import { z } from "zod";
import { prisma } from "../../../config";
import { defineTool, toolRegistry } from "../../registry";
import { holtWintersTriple } from "../../../services/forecasting/holtWinters";

export const forecastDemand = defineTool({
  name: "forecastDemand",
  description: "Predicted hourly demand for the next 7 days, by zone × hour-of-week. Uses 8-week history.",
  inputSchema: {
    type: "object" as const,
    properties: {
      zone: { type: "string", description: "Optional zone (Hawally, Avenues, Salmiya, Jabriya)." },
      horizonHours: { type: "integer", minimum: 24, maximum: 336, default: 168 },
    },
    additionalProperties: false,
  },
  inputValidator: z.object({ zone: z.string().optional(), horizonHours: z.number().int().min(24).max(336).default(168) }),
  strict: true,
  sideEffect: "read",
  requiredRole: ["ADMIN", "OPS_MANAGER", "ACCOUNTANT", "VIEWER"],
  requiresApproval: false,
  allowedAgents: ["*"],
  async execute(ctx, input) {
    // 1. cache check
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `forecast:demand:${input.zone ?? "ALL"}:${today}`;
    const cached = await prisma.agentMemory.findFirst({
      where: { tenantId: ctx.tenantId, key: cacheKey },
      orderBy: { createdAt: "desc" },
    });
    if (cached && cached.source === "cached_forecast") return cached.value;

    // 2. fetch hourly series via raw SQL (Postgres date_trunc)
    const raw = await prisma.$queryRaw<{ hour: Date; orders: bigint }[]>`
      SELECT date_trunc('hour', timestamp AT TIME ZONE 'Asia/Kuwait') AS hour,
             SUM(CASE WHEN action = 'order_delivered' THEN 1 ELSE 0 END) AS orders
      FROM "OrderEvent"
      WHERE "tenantId" = ${ctx.tenantId}
        AND timestamp >= NOW() - INTERVAL '8 weeks'
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const series = raw.map(r => Number(r.orders));

    // 3. cold-start tiers
    if (series.length < 14 * 24) {
      const result = { tier: "insufficient", message: "Forecast available after 14 days of operations", forecast: [], ci90: { lower: [], upper: [] } };
      return result;
    }
    if (series.length < 8 * 7 * 24) {
      // simple DOW × hour average
      const grouped = new Array(168).fill(null).map(() => [] as number[]);
      for (let i = 0; i < series.length; i++) grouped[i % 168].push(series[i]);
      const averaged = grouped.map(g => g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
      const horizon = Array.from({ length: input.horizonHours }, (_, h) => averaged[h % 168]);
      return { tier: "averaged", forecast: horizon, ci90: { lower: horizon.map(x => x * 0.7), upper: horizon.map(x => x * 1.3) } };
    }

    // 4. full Holt-Winters
    const hw = holtWintersTriple(series, 168, 0.3, 0.05, 0.2, input.horizonHours);
    const result = { tier: "hw", forecast: hw.forecast, ci90: hw.ci90 };
    await prisma.agentMemory.create({
      data: { tenantId: ctx.tenantId, key: cacheKey, value: result as any, source: "cached_forecast", confidence: 0.7 },
    });
    return result;
  },
});

toolRegistry.register(forecastDemand);
```

### Aggregate evaluator — "3 lates in 7 days"
```typescript
// Source: backend/src/services/standingRules/aggregateEvaluator.ts (new)
import { prisma } from "../../config";

export async function evaluateAggregateRule(rule: StandingRule, tenantId: string) {
  if (rule.condition.event !== "attendance_late") return [];
  const window = rule.condition.aggregateWindow!.days;
  const since = new Date(Date.now() - window * 86_400_000);

  // groupBy driverId, count lates in window
  const grouped = await prisma.attendanceRecord.groupBy({
    by: ["driverId"],
    where: {
      tenantId,
      scheduledStart: { gte: since },
      isLate: true,
      driver: { status: "ACTIVE", deletedAt: null },  // Pitfall 5 guard
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: rule.condition.threshold.minCount } },
    },
  });

  return grouped.map(g => ({
    subjectId: g.driverId,
    subjectType: "Driver" as const,
    evidence: { lateCount: g._count.id, window: `${window}d` },
  }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standing rules as Markdown-stored prompts in `ScheduledBriefing.type="standing_rule_v3"` (Phase 4 no-op) | Structured-JSON `AgentRule` rows evaluated by typed evaluator | Phase 12 design | The Phase 4 no-op slot is finally wired; `ScheduledBriefing.type` stays for chat-driven recurring summaries, `AgentRule` is the new home for "if X then Y" |
| Manual KPI thresholds in `PlatformSettings.kpis` only | KPI thresholds + standing rules + cron-evaluated aggregates as a single owner-authored surface | Phase 12 design | Owners now have one UI for "the agent will propose X when Y" instead of buried JSON in PlatformSettings |
| Forecasting via training data (none exists today) | Pure mathematical model (Holt-Winters) | Phase 12 design | No model registry, no version pinning needed; the math is in source |
| Forecast outputs render only in `/forecast` page | Forecast outputs injected into morning briefing AND `/forecast` AND per-platform tabs | Phase 12 design | Owners see forecasts where they already look (briefing) instead of needing to remember `/forecast` exists |
| All proposed decisions LOCKED at PRD draft time | 5 master-gate decisions promoted to LOCKED in PROJECT.md after design-partner-2 validates | Phase 12 closeout | Founder retains rollback authority on each LOCKED decision via the conditional-lock pattern |

**Deprecated/outdated:**
- Phase 4's `ScheduledBriefing.type="standing_rule_v3"` no-op (worker file: `scheduledBriefingsWorker.ts:286-309`) is replaced by the new `standingRulesEventListener.ts` + `standingRulesCronWorker.ts`. The `type` column stays for backwards compatibility (zero rows in production), and the no-op branch is removed from the worker.
- The PRD's `AgentRule` placeholder hint (REQ-data-agent-rule from Phase 1) is finally specified in Phase 12; until now the table was scaffold-only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 11 ships before Phase 12 — trust-graduation hooks + memory pruning are required by the forecast cache pattern (`source='cached_forecast'`) | Pattern 4, all forecast code | If Phase 11 slips, drop the cache and recompute on every call; forecastDemand becomes ~300ms slower per briefing but functionally correct |
| A2 | `OrderEvent` table has enough volume (≥14 days × ≥24 events/day) for Holt-Winters within 30 days of tenant onboarding | Pitfall 2 cold-start tiers | If `OrderEvent` is sparse (Phase 1 added the table but Phase 6 only wires Keeta+Americana ingest), the cold-start "insufficient" tier may persist for months; fall back to `OrderLog` (per-driver-per-day daily aggregate, simpler series) for the averaged tier |
| A3 | The `editableParams` allow-list on existing action tools is the right surface for rule action params | Pattern 1 + Code Example "Rule builder UI" | If owners want to set params beyond `editableParams` (e.g., suspendDriver.durationDays), need to add a separate "rule-allow-list" array on each tool; default to allow-list union of editableParams ∪ rule-specific extras |
| A4 | 5 default rule templates are enough for design-partner-2 to author useful rules out of the box | `services/standingRules/catalog.ts` | If 5 templates isn't enough, Wave 2 expands to 10 — low risk, additive work |
| A5 | Holt-Winters multiplicative is the right model for delivery demand (vs. additive) | Pattern 3 | Demand swings proportionally with baseline (Ramadan halves Tuesday, doesn't subtract 50 orders), so multiplicative is correct. If a tenant emerges with zero-baseline hours (overnight), the multiplicative formula divides by zero — add an `epsilon=1` floor on level |
| A6 | Forecast linear regression on cash flow uses 90 days of `*DailyMetrics` revenue history | `forecastCashFlow` | 90 days is enough for a single tenant — but a tenant onboarded < 90 days falls into cold-start; same tiered fallback as forecastDemand |
| A7 | Rule firing chain depth ≤ 3 is sufficient to prevent oscillation in practice | Pitfall 1 | If 3 is too generous (some legitimate chains > 3), bump to 5 and add per-rule `maxChainDepth` override. If 3 is too tight (legitimate 2-step chains get blocked), watch the rejection metric and adjust |
| A8 | `AgentRule` model already exists from Phase 1 (REQ-data-agent-rule) | Architecture | If Phase 1 deferred the schema (unlikely — REQUIREMENTS.md says it's mapped to Phase 1), Wave 0 includes the additive migration; if model is missing, Wave 0 creates from scratch |
| A9 | `/decisions` inbox can handle a 10×-traffic spike from rule firings without UX degradation | Pitfall 4 throttling | If owners drown in proposals, the per-tenant cap (Pattern 1 `throttle.perTenant`) saves them. Default `{ window: "1d", max: 5 }` is conservative |
| A10 | LOCKED decisions ratification can happen in Wave 3 even if design-partner-2 onboarding reveals a pricing pushback | Pitfall 8 | Conditional-lock pattern absorbs the case where the LOCKED decision needs a rollback clause; full unconditional lock waits for explicit founder sign-off |
| A11 | Anthropic NL→JSON-rule extraction is OPTIONAL — not required to ship Phase 12 | Stack table | If the NL extraction adds polish, it's a 1-task add; the visual rule builder is the primary surface |
| A12 | `forecastSupplyGap` can compute "shifts scheduled in hour X" purely from `Shift` table (no need for `Attendance` actuals) | Architecture map | Forecasting is about future, not past — `Shift.scheduledStart/End` is the right source. Actuals belong in a separate "supply realisation" view (out of scope Phase 12) |

## Open Questions

1. **Should rule-fired proposals visually differ from monitor-fired proposals in `/decisions`?**
   - What we know: Phase 2's `/decisions` UI shows coloured tags by action type (Suspend, Warn, etc.). The card source (monitor agent vs. standing rule) isn't surfaced.
   - What's unclear: Owners might want to know "this came from a rule I authored" to decide whether to disable the rule on dismiss.
   - Recommendation: Add a subtle "via rule: [rule name]" footer link on the card. Clicking opens the rule editor. Dismiss has a new "Disable this rule" option in the dismiss-feedback modal.

2. **Are forecasts in the morning briefing always shown, or only when actionable?**
   - What we know: Phase 11 briefings end with "today's top 3 risks." Forecasts could either be a separate paragraph or embedded in the risks.
   - What's unclear: A flat forecast paragraph ("demand will be 600 orders today, normal") adds words without insight; an actionable forecast ("Hawally 18-20h forecast 30% above last week — consider boosting") is the value.
   - Recommendation: Briefing prompt instructs the model to mention forecast ONLY when |forecast - 4wk_avg| > 15% in any zone-hour bucket. Otherwise stay silent.

3. **Where does cash-flow forecast surface?**
   - What we know: Phase 8 ships `/finance/expenses-pl`. The 30/60/90-day projection naturally extends that page.
   - What's unclear: Is the cash flow projection part of `/forecast` (alongside demand + supply) or part of `/finance/expenses-pl` (alongside historical P&L)?
   - Recommendation: Both — render the same `<CashFlowProjection>` component on both pages. On `/finance/expenses-pl` it's a tab; on `/forecast` it's the third tab alongside Demand and Supply.

4. **Does the 5-LOCKED-decisions ratification need design-partner-2 input, or only design-partner-1 retrospective?**
   - What we know: PROJECT.md says master gates need founder sign-off, not customer sign-off.
   - What's unclear: But "DEC-pricing-target KD 200 minimum" feels stronger after a second customer pays it.
   - Recommendation: Conditional lock at Wave 3 close based on founder's read of design-partner-1 evidence. Design-partner-2 is a Phase 12 deliverable but its outcome isn't a Phase 12 gate.

5. **Should the rule builder support "AND" of multiple conditions, or just one event + threshold?**
   - What we know: Pattern 1's `condition` is single-event. JsonLogic-style `{ "and": [...] }` would let "late 3+ in week AND cash overdue" rules.
   - What's unclear: Owners may want compound rules.
   - Recommendation: v1 ships single-event only. v2 adds `condition: { all: [...] }` AND `condition: { any: [...] }` wrappers. Defer to a Phase 12.1 follow-up if a real customer asks.

6. **Standing rule export/import — is there a "share template" mechanic between tenants?**
   - What we know: Phase 12 ships per-tenant rules.
   - What's unclear: Could the founder export design-partner-1's "good" rules and seed them into design-partner-2's tenant at onboarding?
   - Recommendation: Wave 2 includes a "Rule template" export — JSON dump of a single rule with the tenant-specific bits stripped. Phase 12 Wave 3 design-partner-2 onboarding uses these to seed 3-5 templates immediately.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 15 | Prisma + raw `$queryRaw` `date_trunc` | Assumed (docker-compose) | 15 | None — required |
| Redis 7 | BullMQ `JobScheduler` for cron + rule throttle | Assumed (docker-compose) | 7.x | If REDIS_URL is unset, `standingRulesCronWorker` no-ops (same pattern as Phase 11) |
| BullMQ | 5.73.4 | ✓ in package.json | 5.73.4 | None |
| @anthropic-ai/sdk | Optional NL→rule extraction | ✓ in package.json | 0.80.0 | If unavailable, rule builder UI hides the "describe in plain English" field |
| `@prisma/client` | Schema queries + groupBy aggregations | ✓ in package.json | 5.22.0 | None |
| Vercel CLI | Wave 3 production deploy | Assumed (per memory `feedback_auto_deploy_vercel`) | latest | None — required |
| Phase 11 trust-graduation hooks | Auto-fire rule actions when trust allows | Depends on Phase 11 ship | n/a | If Phase 11 delays, Phase 12 ships with propose-and-confirm only (zero auto-fire); add auto-fire later as a follow-up |
| Phase 8 action tools | Rule action target (`suspendDriver`, `applyPenalty`, etc.) | Depends on Phase 8 ship | n/a | If Phase 8 delays, Phase 12 ships with only `flagForReview` + `draftCourierMessage` (the always-available tools) as rule action targets |
| Design partner #2 commitment | Wave 3 onboarding | ✗ (not yet identified per PROJECT.md Open Questions Q2) | n/a | Wave 3 ships LOCKED-decisions ratification + production deploy even if DP2 onboarding slips; the founder owns the DP2 milestone separately |

**Missing dependencies with no fallback:** None block phase execution.

**Missing dependencies with fallback:**
- **Phase 8 action tools:** If Phase 8 hasn't shipped, Phase 12's rule action target dropdown only shows `flagForReview` and `draftCourierMessage`. Useful, but limited. Plan dependency check before Wave 2.
- **Phase 11 trust-graduation:** If Phase 11 hasn't shipped, all rule firings go through propose-and-confirm. This is the v1 default anyway; nothing breaks.
- **Design partner #2:** If DP2 isn't ready, ship the production deploy + LOCKED ratification; DP2 onboarding becomes a Phase 12.1 follow-up.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.9 + supertest 7.2.2 (backend) [VERIFIED: backend/package.json]; Vitest 3.x + @testing-library/react (frontend) [VERIFIED: frontend/package.json] |
| Config file | `backend/jest.config.*` (existing, Phase 1+); `frontend/vitest.config.ts` |
| Quick run command | `cd backend && npm test -- --testPathPatterns=phase12`; `cd frontend && npm run test:run -- standingRules forecast` |
| Full suite command | `cd backend && npm test`; `cd frontend && npm run test:run` |

### Phase Requirements → Test Map

Phase 12 owns one requirement directly: **REQ-data-agent-rule**. Forecasting work uses **REQ-agent-read-tools** (originally Phase 1 — Phase 1 deferred the forecast tools per its plan 03 README).

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-data-agent-rule | StandingRule with `condition.event="attendance_late"` + `threshold.minCount=3` + `aggregateWindow.days=7` fires for a driver with 3 late records in 7 days; calls `toolRegistry.invoke("suspendDriver", ...)` with `userId=undefined`; PendingAgentAction row written | integration | `npm test -- src/__tests__/services/standingRules/aggregateEvaluator.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Realtime rule with `condition.event="violation"` + `aggregateWindow=null` fires immediately on `eventBus.publish({type:"violation"})` | integration | `npm test -- src/__tests__/services/standingRules/eventListener.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Per-subject throttle blocks 2nd fire within window; per-tenant cap bumps to flagForReview | unit | `npm test -- src/__tests__/services/standingRules/throttle.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Dry-run replays last 7 days; returns hypothetical matches without writing PendingAgentAction | integration | `npm test -- src/__tests__/services/standingRules/dryRunService.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Chain depth > 3 rejected (oscillation guard) | unit | `npm test -- src/__tests__/services/standingRules/chainDepth.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Aggregate evaluator skips INACTIVE drivers (Pitfall 5) | unit | `npm test -- src/__tests__/services/standingRules/aggregateEvaluator.inactiveDrivers.test.ts` | ❌ Wave 0 |
| REQ-data-agent-rule | Cron worker idempotency — second run same-day for same tenant no-ops | integration | `npm test -- src/__tests__/queues/standingRulesCronWorker.idempotent.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastDemand) | Returns `tier="insufficient"` for tenant with < 14 days history | unit | `npm test -- src/__tests__/agent/tools/read/forecastDemand.coldStart.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastDemand) | Returns `tier="averaged"` for 14-56 days history | unit | `npm test -- src/__tests__/agent/tools/read/forecastDemand.averaged.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastDemand) | Returns `tier="hw"` with predicted + ci90 for ≥ 56 days history | integration | `npm test -- src/__tests__/agent/tools/read/forecastDemand.hw.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastDemand) | Cache hit on 2nd call same day (AgentMemory key=forecast:demand:YYYY-MM-DD) | integration | `npm test -- src/__tests__/agent/tools/read/forecastDemand.cache.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastSupplyGap) | Joins demand forecast with Shift scheduled hours; flags hours where forecast > scheduled × 1.2 | integration | `npm test -- src/__tests__/agent/tools/read/forecastSupplyGap.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastCashFlow) | 30/60/90 day linear regression on KeetaDailyMetrics + Talabat + Deliveroo revenue minus expense trend | integration | `npm test -- src/__tests__/agent/tools/read/forecastCashFlow.test.ts` | ❌ Wave 0 |
| REQ-agent-read-tools (forecastCashFlow) | Returns `tier="insufficient"` for tenant with < 30 days history | unit | `npm test -- src/__tests__/agent/tools/read/forecastCashFlow.coldStart.test.ts` | ❌ Wave 0 |
| Holt-Winters math | `holtWintersTriple([1..1000], 168, 0.3, 0.05, 0.2)` returns finite numbers; ci90 lower ≥ 0; forecast has length=horizon | unit | `npm test -- src/__tests__/services/forecasting/holtWinters.test.ts` | ❌ Wave 0 |
| Holt-Winters math | Throws on series length < 2*period | unit | (same file) | ❌ Wave 0 |
| Rules API | `POST /api/rules` validates condition+action JSON via Zod, returns 400 on malformed | integration | `npm test -- src/__tests__/routes/rules.test.ts` | ❌ Wave 0 |
| Rules API | `POST /api/rules/:id/dry-run` returns wouldFire matches without side effects | integration | `npm test -- src/__tests__/routes/rules.dryRun.test.ts` | ❌ Wave 0 |
| REQ-tenant-scoped-everything (regression) | All Phase 12 new code paths pass `lint:tenant` rule | lint | `npm run lint:tenant` | ✓ (script exists; extend glob in Wave 0) |
| Frontend /rules page | Renders rule list; create flow opens editor; dry-run preview shows matches | component | `cd frontend && npm run test:run -- rules` | ❌ Wave 0 |
| Frontend /forecast page | Renders DemandForecastChart with Recharts; tier="insufficient" shows fallback copy | component | `cd frontend && npm run test:run -- forecast` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPatterns=$(echo $TASK_DOMAIN)` (e.g., `--testPathPatterns=standingRules` or `--testPathPatterns=forecasting`)
- **Per wave merge:** `npm test -- --testPathPatterns='(standingRules|forecasting|agent/tools/read/forecast|routes/rules|queues/standingRulesCronWorker)'`
- **Phase gate:** `npm test && npm run lint:tenant && npm run lint && (cd frontend && npm run test:run)` all green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/services/standingRules/aggregateEvaluator.test.ts` — REQ-data-agent-rule, "3 lates → suspension"
- [ ] `backend/src/__tests__/services/standingRules/aggregateEvaluator.inactiveDrivers.test.ts` — Pitfall 5
- [ ] `backend/src/__tests__/services/standingRules/eventListener.test.ts` — realtime rule firing
- [ ] `backend/src/__tests__/services/standingRules/throttle.test.ts` — per-subject + per-tenant
- [ ] `backend/src/__tests__/services/standingRules/dryRunService.test.ts` — 7-day replay
- [ ] `backend/src/__tests__/services/standingRules/chainDepth.test.ts` — oscillation guard (Pitfall 1)
- [ ] `backend/src/__tests__/queues/standingRulesCronWorker.idempotent.test.ts` — idempotency (Pitfall 7)
- [ ] `backend/src/__tests__/agent/tools/read/forecastDemand.coldStart.test.ts` — tier=insufficient
- [ ] `backend/src/__tests__/agent/tools/read/forecastDemand.averaged.test.ts` — tier=averaged
- [ ] `backend/src/__tests__/agent/tools/read/forecastDemand.hw.test.ts` — tier=hw
- [ ] `backend/src/__tests__/agent/tools/read/forecastDemand.cache.test.ts` — AgentMemory cache
- [ ] `backend/src/__tests__/agent/tools/read/forecastSupplyGap.test.ts` — shifts × demand math
- [ ] `backend/src/__tests__/agent/tools/read/forecastCashFlow.test.ts` — linear regression
- [ ] `backend/src/__tests__/agent/tools/read/forecastCashFlow.coldStart.test.ts` — <30 days fallback
- [ ] `backend/src/__tests__/services/forecasting/holtWinters.test.ts` — math correctness
- [ ] `backend/src/__tests__/routes/rules.test.ts` — CRUD + Zod validation
- [ ] `backend/src/__tests__/routes/rules.dryRun.test.ts` — dry-run endpoint
- [ ] `frontend/src/app/(dashboard)/rules/__tests__/RuleEditor.test.tsx` — rule builder UI
- [ ] `frontend/src/app/(dashboard)/forecast/__tests__/DemandForecastChart.test.tsx` — chart render + cold-start copy
- [ ] Extend `lint:tenant` npm script in `backend/package.json` to include `src/services/standingRules/ src/services/forecasting/ src/queues/standingRulesCronWorker.ts src/routes/rules.ts src/agent/tools/read/forecastDemand.ts src/agent/tools/read/forecastSupplyGap.ts src/agent/tools/read/forecastCashFlow.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing JWT (15m access + 7d refresh) + `authMiddleware` on all `/api/rules` + `/api/forecast` routes |
| V3 Session Management | yes | Existing session handling preserved; rule CRUD requires owner-role (ADMIN) via existing RBAC |
| V4 Access Control | yes | RBAC + tenantScope middleware on all new routes; rule editing requires ADMIN role (owners only), not OPS_MANAGER |
| V5 Input Validation | yes | Zod validators on `StandingRuleCondition` + `StandingRuleAction` + `StandingRuleThrottle`; action.params re-validated against the target tool's own inputValidator at evaluation time |
| V6 Cryptography | n/a | No new cryptographic primitives; existing Phase 11 `portalCreds.ts` AES-256-GCM unchanged |
| V7 Error Handling | yes | Rule-evaluation failures fall through silently (one bad rule cannot break the event loop); failures recorded as MetricEvent + AgentAction with outcome="failure" |
| V8 Data Protection | yes | Rule definitions tenant-scoped via existing tenantScope middleware; forecast outputs cached in tenant-scoped AgentMemory |
| V9 Communication | yes | All API calls over HTTPS (default); no new external API integrations |
| V10 Malicious Code | partial | Rule `action.params` is owner-supplied JSON — sanitised by Zod + the target tool's inputValidator; cannot execute arbitrary code because the evaluator dispatches by `event` string, not by `eval` |
| V12 Files / Resources | n/a | No file upload/download added |
| V13 API & Web Services | yes | `/api/rules` follows existing route conventions; idempotency via Redis SETNX on rule-firing webhooks (if any added) |

### Known Threat Patterns for Express 4 + Prisma 5 + BullMQ

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious rule fires against another tenant's drivers | Tampering / Elevation of Privilege | Rule evaluator MUST pass `ctx.tenantId` to every downstream Prisma query; lint:tenant rule extended to `services/standingRules/`; integration test asserts cross-tenant `driverId` injection returns 404 |
| Owner authors a rule that causes infinite loop via cycle (Pitfall 1) | Denial of Service | Chain-depth cap = 3; per-subject + per-tenant throttles; admin "kill switch" endpoint `POST /api/rules/:id/disable` |
| `action.params` includes a field outside the tool's `editableParams` allow-list (rule sneaks unauthorized params) | Tampering | Rule evaluator filters `action.params` to the tool's `editableParams` array before invoking — same pattern as Phase 2's approve route |
| Rule SQL injection via `condition.where.driverZone` string | Tampering | Zone string is interpolated only via Prisma's parameterised `where: { zone: input.zone }` — never via `$queryRawUnsafe`; the raw `$queryRaw` in forecastDemand uses tagged-template syntax (safe) |
| Forecast cache poisoning by manipulating `AgentMemory` directly | Tampering | `AgentMemory` writes only via the tool's `execute` — there is no `/api/memory` mutation endpoint; lint:tenant covers the path |
| Cron worker stuck holding Redis idempotency key after crash | Denial of Service | `SETNX EX 600` (10-min auto-expire) instead of forever; if a worker crashes mid-tick, the key clears in 10 minutes and the next cron tick picks up |
| Rule firing during nightly Prisma migration | Tampering / Data integrity | Cron worker checks `prisma.$queryRaw` for a sentinel row (`"_meta" where "key"='migrations_locked'`) before processing; existing Phase 6 pattern |
| BullMQ job payload leak in Redis (rule data visible to anyone with Redis access) | Information Disclosure | Job payloads carry only `tenantId + ruleId`; the worker fetches `rule.condition + rule.action` from Postgres inside the handler — never serialises full rule JSON to Redis |
| Forecast bias from poisoned `OrderEvent` data (malicious courier inflates events) | Tampering | `OrderEvent.timestamp` already carries the source attribution; forecastDemand's WHERE clause excludes events with `action != "order_delivered"` so dropped/cancelled orders don't inflate forecast |
| Dry-run endpoint leaks PII from last-7-days replay (driver names, phones) to unauthorised user | Information Disclosure | Dry-run is RBAC-gated (ADMIN role only); response payload truncates names to first-initial+last-name + redacts phone (`+965 *** **234`) |

## Project Constraints (from CLAUDE.md)

The project CLAUDE.md (project root) imposes:
- **Tech stack:** Express 4 + TypeScript + Prisma 5 (PostgreSQL 15) + Redis 7 + BullMQ. **All Phase 12 new code lives in this stack — no new runtime, no new framework.**
- **AI provider:** Anthropic Claude API. **Optional NL→rule extraction uses `@anthropic-ai/sdk` 0.80.0 + `claude-sonnet-4-6`.**
- **All routes use authMiddleware + tenantScope middleware.** `/api/rules` and `/api/forecast` (if added) MUST follow this convention.
- **Prisma for all DB access (never raw SQL unless aggregation requires it).** Forecasting's `date_trunc('hour', ...)` is exactly the "aggregation requires it" exception — use `$queryRaw` with tagged templates; do not use `$queryRawUnsafe`.
- **Pagination via getPagination() + paginatedResponse() utils.** Rules list endpoint at `/api/rules` must paginate.
- **Error handling: try/catch in every route, return { error: message }.** Applies to `/api/rules` + `/api/forecast`.
- **Frontend: Tailwind utility classes, Shadcn components, Lucide icons.** `/rules` and `/forecast` pages must follow.
- **Arabic/English bilingual support via i18n directory.** Rule names + descriptions stored as `name` (English) only; rule action `params.message` for `draftCourierMessage` MUST honor Phase 9 bilingual contract — agent generates both via the tool's existing logic.
- **Platform-specific code lives under platform-named directories.** Not applicable — rules and forecasts are cross-platform by design.

Additionally, per the user's auto-memory (`feedback_auto_deploy_vercel`):
- **Auto-deploy to Vercel after every edit** — Wave 3 will explicitly include `vercel --prod --yes` from `frontend/` and `backend/`.
- **Alias Vercel deploy to frontend-ebon-nine-34** — after each frontend deploy, `vercel alias set <new-host> frontend-ebon-nine-34.vercel.app`.
- **2-line summary** — Phase 12 verification report ends with the "what changed / what's next" two-liner.

## Sources

### Primary (HIGH confidence)
- `backend/src/agent/registry.ts:120-180` — tool invocation gate; Phase 12 rule firings route through this without modification
- `backend/src/agent/scheduler.ts:78-83` — event subscription pattern reused by `standingRulesEventListener.ts`
- `backend/src/queues/scheduledBriefingsWorker.ts` (Phase 4 shipped) — BullMQ JobScheduler reference for `standingRulesCronWorker.ts`
- `backend/src/services/eventBus.ts:13-30` — `DarbEventType` enum that rules subscribe to
- `backend/src/agent/tools/read/revenueByDay.ts` — `groupBy` pattern reused by forecastDemand cold-start path
- `backend/prisma/schema.prisma:AgentMemory,AgentAction,AgentRunLog,PendingAgentAction,OrderEvent,Shift,KeetaDailyMetrics,TalabatDailyMetrics,DeliverooDailyMetrics` — schema for rule storage, forecasting source data, audit trail
- `.planning/phases/11-trust-v2-briefings/11-RESEARCH.md` — Pattern 4 (Redis sliding-window-log throttle), Pitfall 4 (cron stagger), Pitfall 8 (idempotency key)
- `.planning/REQUIREMENTS.md` — REQ-data-agent-rule (Phase 12) and REQ-agent-read-tools (forecast tools deferred from Phase 1)
- `.planning/PROJECT.md` — DEC-trust-graduated-autonomy v3 (standing rules), CON-rate-limits-v2-autonomy, the 5 master-gate decisions awaiting LOCKED
- Context7 `/prisma/prisma` — `groupBy`, `aggregate`, `$queryRaw` API reference [CITED]
- Context7 `/jwadhams/json-logic-js` — JsonLogic rule shape reference (rejected in favour of hand-rolled evaluator) [CITED]
- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice* §8.3 (Holt-Winters multiplicative seasonal) — otexts.com/fpp3/holt-winters.html [CITED, math reference]
- `frontend/package.json` — Recharts 3.8.1, cmdk 1.1.1 versions verified [VERIFIED]

### Secondary (MEDIUM confidence)
- `backend/src/services/scheduledBriefingsService.ts:46-75` — cron whitelist pattern (Phase 12 extends if rules support custom-cron, currently only supports daily 06:00 default)
- `docs.bullmq.io/guide/job-schedulers` — JobScheduler concurrency caveats

### Tertiary (LOW confidence)
- None. Every recommendation traces to either the codebase, official documentation, or a well-known mathematical reference.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already in `package.json`; verified against installed versions.
- Rule engine architecture: HIGH — structured-JSON evaluator pattern is well-precedented (the agent tool registry's `editableParams` already lives on this exact abstraction).
- Forecasting design: HIGH-MEDIUM — Holt-Winters is mathematically straightforward; the cold-start tiers (Pitfall 2) are a reasoned design choice rather than industry standard. **Open question:** founder may want a fancier statistical model for Phase 12.1; Phase 12 ships the explainable version.
- Pitfalls: HIGH — every pitfall has either a precedent (Phase 11 cron stagger, Phase 1 lint:tenant) or a direct codebase observation (oscillation analysis from the existing event bus pattern).
- LOCKED decisions ratification: MEDIUM — depends on founder's read of design-partner-1 evidence; Pitfall 8 explicitly carves out a "conditional lock" escape hatch.
- Design partner #2: LOW — DP2 has not been identified per PROJECT.md Open Questions Q2; if Phase 12 ships before DP2 is named, that piece slides to Phase 12.1.

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days — stable stack; revisit if Anthropic ships Sonnet 4.7 mid-phase or if BullMQ 6.x lands with breaking JobScheduler changes).
