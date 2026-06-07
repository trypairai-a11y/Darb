# Phase 11: Scheduled Briefings + Trust Graduation v2 + Mature Memory + Partner-API Outreach — Research

**Researched:** 2026-05-13
**Domain:** Agent autonomy graduation, scheduled multi-tenant cron jobs, long-term memory hygiene, encrypted outbound partner integrations
**Confidence:** HIGH

## Summary

Phase 11 graduates the Darb agent from v1 (every action propose-and-confirm) to v2 (three low-risk action classes auto-execute under per-tenant rate caps), ships daily morning/evening briefings to each persona role (owner/dispatcher/accountant), prunes `AgentMemory` to keep the long-term store useful instead of bloated, and stands up the outbound partner-API framework so a fleet that gives us official Keeta/Talabat/Deliveroo API credentials no longer needs the Playwright scraper. The phase also pays down two Phase 1 defects (DI-01-01 lint:tenant 184-violation backlog and DI-01-02 baseline migration gap) that have been tracked since 2026-05-09.

The big architectural decision is **where trust math lives**. Two viable surfaces exist in the codebase: per-tool flags on `ToolDefinition` in `backend/src/agent/registry.ts` (alongside `requiresApproval`) or a per-tenant table referenced from `Tenant` (alongside `designPartner` / `trialEndsAt`). Recommended split: tool-level config in code (`autoApproveThreshold`, `autoApproveMaxConfidenceDrop`, `autoApproveCooldownMinutes`) plus tenant-level state in DB (`trustLevel`, `autoApproveCapDaily`, `rollbacks30d`). The registry's existing `requiresApproval && !ctx.userId` gate (registry.ts:149) is the natural injection point — when the gate fires we look up tool config + tenant state, and either stage a `PendingAgentAction` (v1 path) or execute directly while writing a `source: "auto"` `AgentAction` row.

Briefings reuse the **already-shipped** Phase 4 scaffolding (`ScheduledBriefing` table, `scheduledBriefingsWorker.ts` BullMQ `JobScheduler`, `chatHistoryService.upsertThread`). Phase 11's work is (a) auto-provisioning one briefing row per tenant×role at onboarding, (b) writing the three role-specific narrator prompts, (c) extending the worker to fan out to Notification + SendGrid email, (d) cache-controlling the system prompts so 6+ tenants × 2 briefings/day doesn't blow the Anthropic bill.

**Primary recommendation:** Build all four feature areas in parallel waves; the four areas share zero schema and minimal code surface. Wave 0 lands a 14th `Tenant` migration (trust + briefing time columns), Wave 1 ships briefings + narrator prompts, Wave 2 ships trust graduation + memory pruning (these share the `AgentMemory` cold path), Wave 3 ships the partner-API skeleton (Keeta first, Talabat/Deliveroo stub), Wave 4 closes out DI-01-01 + DI-01-02 + verification.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Briefing cron tick (07:00, 18:00) | API / Backend Worker | — | BullMQ Worker reads from Postgres + Anthropic + emails out; never touches a browser tier |
| Briefing system prompt | API / Backend (prompts/*.md) | — | Reuse `backend/src/agent/prompts/` convention; cached via Anthropic prompt-cache |
| Briefing fan-out (Notification + email) | API / Backend Worker | — | Uses existing `notificationChannels.sendEmail` (SendGrid configured) |
| Briefing visibility in chat history | API + Frontend | — | Worker already writes ChatThread+messages (Phase 4); frontend just renders existing /chat thread list |
| Trust graduation gate | API / Backend (registry.ts) | — | The gate sits inside `ToolRegistryImpl.invoke()` — same code path that handles RBAC + approval today |
| Trust state read (per-tenant) | API / Backend (Prisma) | — | `Tenant.trustLevel` column + 30-day rollback count derived from `AgentAction.rolledBackAt` |
| Trust state write (admin override) | API / Backend + Frontend Admin UI | — | Founder must be able to flip a tenant back to v1 quickly if trust breaks |
| Memory pruning worker | API / Backend Worker | — | Pure DB job; runs once daily at 03:00 Kuwait; deletes stale + compresses observations |
| Partner-API outreach (Keeta/Talabat/Deliveroo) | API / Backend (services/ingest/) | — | Sits behind the Phase 6 adapter interface; only new code path is the API client itself |
| Encrypted partner-API secrets | API / Backend (utils/portalCreds.ts) | — | Reuse the AES-256-GCM `PORTAL_CRED_KEY` envelope already used by portal scrapers |
| Tenant trust level toggle UI | Frontend (admin) | — | One field on `/admin/tenants/[id]` page; founder-only via existing super-admin middleware |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BullMQ | 5.73.4 | Cron via JobScheduler; memory pruning daily worker; partner-API pull worker | Already in package.json + already in use in scheduledBriefingsWorker.ts (Phase 4) [VERIFIED: backend/package.json] |
| @anthropic-ai/sdk | 0.80.0 | Narrator briefing generation with prompt caching | Already wired through `backend/src/agent/runtime.ts`; the `cache_control` block on system prompts is the headline saving for Phase 11 [VERIFIED: backend/package.json] |
| Prisma | 5.22.0 | Tenant column additions + AgentMemory query work | Already canonical [VERIFIED: backend/package.json] |
| @sendgrid/mail | 8.1.6 | Email delivery of briefings to ADMIN role | Already in dependency tree + already used via `notificationChannels.sendEmail` [VERIFIED: backend/package.json + backend/src/services/notificationChannels.ts:75-87] |
| ioredis | 5.4.1 | BullMQ connection + per-tenant rate-limit counters | Already in use; Phase 11's rate-limit Sliding-Window-Log lives in Redis [VERIFIED: backend/package.json] |
| zod | 3.23.8 | Trust config validators + partner-API payload schemas | Already canonical for tool input validation [VERIFIED: backend/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-fetch (built-in `fetch`) | Node 22 native | Partner-API HTTP calls (Keeta/Talabat/Deliveroo REST) | Node 22 ships native fetch (CLAUDE.md confirms backend on Node 22); no axios dependency required [VERIFIED: backend/package.json devDependencies @types/node 22.9.0] |
| crypto (Node built-in) | n/a | Reuse `utils/portalCreds.ts` AES-256-GCM helpers for partnerApiSecrets | Already implemented and tested for Keeta portal scraper credentials [VERIFIED: backend/src/utils/portalCreds.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ JobScheduler for one cron per ScheduledBriefing | One shared cron (e.g. `* */15 * * *`) that fans out per-tenant | Shared cron wastes ticks (most tenants have nothing to do at 9:15am) and serializes work; per-briefing scheduler is what the codebase already does (Phase 4) — keep it |
| `cache_control: ephemeral` 5-minute on system prompt | 1-hour TTL on system prompt | Briefings fire ~12 times/day at most (6 tenants × 2/day); 5-min cache only hits within a fan-out window. 1h cache (`{type: "ephemeral", ttl: "1h"}`) costs 2× per write but pays back for any tenant burst. **Recommend 1h.** [CITED: platform.claude.com/docs/en/build-with-claude/prompt-caching] |
| New AgentRule table for trust config | Hardcode trust config in TypeScript per tool | Phase 12 needs AgentRule anyway; Phase 11 staying tool-config-in-code keeps the founder-gated "auto-approve threshold" knob owned by engineering, not by tenants. Move to AgentRule when Phase 12 ships standing rules. |
| AgentMemory hard delete after 90d | Move to AgentMemoryArchive cold table | Hard delete is simpler and `AgentMemory` was designed as append-only — the audit trail is `AgentAction`, not `AgentMemory`. Stale observations have no archival value. **Recommend hard delete with `source='founder_pinned'` exemption.** |

**Installation:** No new dependencies — every library is already in `backend/package.json`.

**Version verification:**
```bash
cd /Users/mac/Documents/Darb/backend && npm ls bullmq @anthropic-ai/sdk @sendgrid/mail
# bullmq@5.73.4
# @anthropic-ai/sdk@0.80.0
# @sendgrid/mail@8.1.6
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Phase 11 — runtime view                      │
└──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────┐  cron tick @ 07:00 Asia/Kuwait
  │ BullMQ JobScheduler  │ ─────────────────────────────┐
  │ (Phase 4 shipped;    │  cron tick @ 18:00           │
  │  Phase 11 extends    │ ─────────────────────────────│
  │  with role prompts)  │  cron tick @ 03:00 (prune)   │
  └──────────────────────┘ ─────────────────────────────┤
                                                        ▼
                       ┌──────────────────────────────────────────┐
                       │ scheduledBriefingsWorker.processTick()   │
                       │  - load ScheduledBriefing row            │
                       │  - load tenant + user                    │
                       │  - runAgent("chat") with role prompt     │
                       │    (system prompt cache_control:1h)      │
                       └──────────────────────────────────────────┘
                                              │
                ┌─────────────────────────────┼────────────────────────────┐
                ▼                             ▼                            ▼
       ┌────────────────┐         ┌──────────────────────┐      ┌────────────────────┐
       │ ChatThread +   │         │ Notification (cat=   │      │ SendGrid email     │
       │ 2 ChatMessages │         │ IMPORTANT)           │      │ to ADMIN role users│
       │ (existing)     │         │ + bilingual fields   │      │ (text only v1)     │
       └────────────────┘         └──────────────────────┘      └────────────────────┘


  ┌──────────────────────┐  agent calls draftCourierMessage(intent=WARN_GPS_STALE)
  │  monitor agent /     │ ────────────────────────────────────────────┐
  │  chat agent          │                                             │
  └──────────────────────┘                                             ▼
                                          ┌──────────────────────────────────┐
                                          │ ToolRegistryImpl.invoke()        │
                                          │ (registry.ts:120)                │
                                          │                                  │
                                          │  RBAC check ─┐                   │
                                          │              ▼                   │
                                          │  Approval gate (existing v1):    │
                                          │    if requiresApproval &&        │
                                          │       !ctx.userId  ─────────────┐│
                                          │                                  │
                                          │  ► Phase 11 INSERT: trust gate  ││
                                          │    if tool.autoApprovable &&    ││
                                          │       tenant.trustLevel ≥ 2 &&  ││
                                          │       confidence > 0.8 &&       ││
                                          │       rollbacks30d == 0 &&      ││
                                          │       withinRateCap()           ││
                                          │      → set virtual ctx.userId   ││
                                          │      → write AgentAction        ││
                                          │        with source="auto"       ││
                                          │      → execute()                ││
                                          │    else ─────────────────────────┤│
                                          │                                  ││
                                          │  ◄ Existing v1 path: stage      ◄┘
                                          │    PendingAgentAction            │
                                          └──────────────────────────────────┘
                                                       │
                                       ┌───────────────┴───────────────┐
                                       ▼                               ▼
                            ┌──────────────────────┐      ┌────────────────────┐
                            │ Execute tool body    │      │ Decisions inbox    │
                            │ (notify, write, etc.)│      │ (existing)         │
                            └──────────────────────┘      └────────────────────┘


  ┌──────────────────────┐  daily 03:00 Asia/Kuwait
  │ memoryPruneWorker.ts │ ───────────────────────┐
  │ (new this phase)     │                        ▼
  └──────────────────────┘  ┌────────────────────────────────────────────────┐
                            │ For each tenant:                                │
                            │  - DELETE AgentMemory                           │
                            │    WHERE createdAt < now - 90d                  │
                            │    AND source NOT IN ('founder_pinned',         │
                            │                       'user_correction')        │
                            │    AND key NOT LIKE 'dismissed:%'               │
                            │  - For each (tenantId, keyPrefix), keep         │
                            │    latest 20 rows; compress older into one      │
                            │    "summary" row with source='observation_     │
                            │    compressed'                                  │
                            │  - Write MetricEvent(event='memory_pruned')     │
                            └────────────────────────────────────────────────┘


  ┌──────────────────────┐  partner-API token refresh + daily pull
  │ partnerApiPullWorker │ ───────────────────────┐
  │ .ts (new)            │                        ▼
  └──────────────────────┘  ┌────────────────────────────────────────────────┐
                            │ Per tenant × platform with partnerApiSecrets:   │
                            │  1. decryptCred(partnerApiSecrets[platform])   │
                            │  2. fetch(`${baseUrl}/partner/daily-stats`)    │
                            │     with bearer + tenantId path                 │
                            │  3. Map response → KeetaDailyMetrics /          │
                            │     TalabatDailyMetrics / DeliverooDailyMetrics │
                            │     via Phase 6 adapter interface               │
                            │  4. Write IngestRun row (PORTAL_API source)     │
                            └────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/src/
├── agent/
│   ├── prompts/
│   │   ├── briefing-owner.md           # NEW (Phase 11)
│   │   ├── briefing-accountant.md      # NEW
│   │   ├── briefing-dispatcher.md      # NEW
│   │   └── briefing-evening.md         # NEW (variant for 18:00)
│   ├── trustGraduation.ts              # NEW: tool-config registry + gate logic
│   └── memoryCompactor.ts              # NEW: compression helpers used by prune worker
├── queues/
│   ├── scheduledBriefingsWorker.ts     # EXTENDED: add briefing-role fan-out + email
│   ├── memoryPruneWorker.ts            # NEW
│   └── partnerApiPullWorker.ts         # NEW
├── services/
│   ├── ingest/
│   │   └── partnerApi/                 # NEW directory
│   │       ├── types.ts                # PartnerApiAdapter interface
│   │       ├── keeta.ts                # KeetaPartnerApiAdapter (live)
│   │       ├── talabat.ts              # TalabatPartnerApiAdapter (stub if no creds yet)
│   │       └── deliveroo.ts            # DeliverooWebhookAdapter (webhook receiver stub)
│   └── briefingProvisionService.ts     # NEW: auto-create one row per tenant×role at onboarding
└── routes/
    └── admin/
        └── trust.ts                    # NEW: POST /api/admin/tenants/:id/trust { level, capDaily }

frontend/src/app/
└── (dashboard)/
    └── admin/
        └── trust/                      # NEW page (founder-only)
            └── page.tsx                # /admin/trust — per-tenant trust dashboard
```

### Pattern 1: Per-tenant cron fan-out via BullMQ JobScheduler
**What:** Each `ScheduledBriefing` row owns its own `JobScheduler` entry; no shared cron, no per-tenant loop inside one cron.
**When to use:** When the work-per-tick differs by tenant and one Anthropic call per tenant is the bottleneck (not Redis).
**Example:**
```typescript
// Source: backend/src/queues/scheduledBriefingsWorker.ts:107-122 (existing, Phase 4)
const schedulerId = `${SCHEDULER_PREFIX}:${briefing.id}`;
await queue.upsertJobScheduler(
  schedulerId,
  { pattern: briefing.cron, tz: "Asia/Kuwait" },
  {
    name: "scheduled-briefing-tick",
    data: { briefingId, tenantId, userId, prompt, type: "briefing" },
  },
);
```
Each call is idempotent — re-upsert with same id replaces the cron pattern in place (RESEARCH §upsertJobScheduler [CITED: api.docs.bullmq.io]). The worker's concurrency: 2 in the existing code lets two tenants run in parallel without head-of-line blocking but caps Anthropic spend.

### Pattern 2: Anthropic prompt caching for high-fan-out briefings
**What:** Place `cache_control: { type: "ephemeral", ttl: "1h" }` on the **system prompt** in the narrator briefing call, not on the user prompt.
**When to use:** Whenever the same long system prompt is reused across many tenants in a tight window.
**Example:**
```typescript
// Source: platform.claude.com/docs/en/build-with-claude/prompt-caching
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: [
    {
      type: "text",
      text: readFileSync("backend/src/agent/prompts/briefing-owner.md", "utf8"),
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ],
  messages: [
    {
      role: "user",
      content: `Tenant ${tenantId}. Generate the 07:00 morning briefing. Stats: ${JSON.stringify(stats)}.`,
    },
  ],
});
```
**Cost math:** Sonnet 4.6 minimum cache threshold is 2,048 tokens [CITED: platform.claude.com prompt-caching docs]. A 3,000-token system prompt cached for 1 hour costs 2× write on first tenant of the day, then 0.1× reads for subsequent tenants. At 6 paying fleets × 2 briefings/day, the cache hit rate is ~92% after the first call — a ~9× cost reduction on the system-prompt portion.

### Pattern 3: Trust gate as an additive layer in `ToolRegistryImpl.invoke()`
**What:** Insert the trust check **between** the existing approval-gate fall-through and the execute path (registry.ts:148-167). When the trust gate passes, mint a synthetic `ctx.userId = "system:auto-approve"` and let the existing execute branch run, then write an `AgentAction` row with `source: "auto"` + `approverId: "system:auto-approve"`.
**When to use:** Tools that are explicitly allow-listed by the per-tool config (NOT all tools).
**Example:**
```typescript
// Source: backend/src/agent/registry.ts:148-167 (existing) + Phase 11 insertion
if (tool.requiresApproval && !ctx.userId) {
  // ► Phase 11 trust check (new):
  const trustDecision = await evaluateTrustGate({
    tenantId: ctx.tenantId,
    toolName: name,
    confidence: opts.confidence ?? 0,
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
  });
  if (trustDecision.autoApprove) {
    ctx = { ...ctx, userId: SYSTEM_AUTO_APPROVE_USER_ID };
    await writeAgentAction({
      tenantId: ctx.tenantId,
      approverUserId: SYSTEM_AUTO_APPROVE_USER_ID,
      toolName: name,
      originalProposal: input,
      outcome: "success",
      reasoning: trustDecision.reasoning,
      source: "auto",
    });
    // fall through to execute path below — DO NOT return early
  } else {
    // existing v1 behaviour — stage PendingAgentAction
    const pending = await prisma.pendingAgentAction.create({ /* ... */ });
    return { status: "pending_approval", pendingActionId: pending.id };
  }
}
// Existing execute + audit block continues here.
```
This pattern is **non-breaking**: any tool not allow-listed for auto-approve falls through to the v1 path. The synthetic `system:auto-approve` user ID needs a corresponding `User` row seeded in migrations (similar pattern to the existing "Darb" hardcoded proposer string).

### Pattern 4: Per-tenant rate limit via Redis sliding-window-log
**What:** Use a Redis sorted set keyed `ratelimit:auto-approve:${tenantId}:${dateYYYYMMDD}` with the timestamp as score. To check, `ZADD` the current call + `ZREMRANGEBYSCORE` older than the window + `ZCARD` to count.
**When to use:** Per-tenant caps on auto-approved actions (default 50/day, configurable in `Tenant.autoApproveCapDaily`).
**Example:**
```typescript
// Source: pattern is standard sliding-window-log; codebase uses ioredis throughout
async function withinRateCap(tenantId: string, cap: number): Promise<boolean> {
  const redis = getConnection();
  const today = new Date().toISOString().slice(0, 10);
  const key = `ratelimit:auto-approve:${tenantId}:${today}`;
  const now = Date.now();
  await redis.zadd(key, now, `${now}-${crypto.randomUUID()}`);
  await redis.expire(key, 90_000); // 25h TTL
  const count = await redis.zcard(key);
  return count <= cap;
}
```

### Pattern 5: Append-only AgentMemory compaction (NOT delete)
**What:** Memory pruning compresses N old observations into one synthetic row with `source: "observation_compressed"`, instead of hard-deleting. The latest row by key still wins via the existing `latestMemoryByKey` ordering.
**When to use:** Keep query semantics intact even after pruning.
**Example:**
```typescript
// Pseudo-code; full implementation in agent/memoryCompactor.ts
async function compactKey(tenantId: string, key: string) {
  const rows = await prisma.agentMemory.findMany({
    where: { tenantId, key, source: { notIn: ["founder_pinned", "user_correction"] } },
    orderBy: { createdAt: "desc" },
    skip: 20,  // keep latest 20 verbatim
  });
  if (rows.length < 5) return;
  await prisma.$transaction([
    prisma.agentMemory.create({
      data: {
        tenantId, key,
        value: { compressedFrom: rows.length, summary: summarize(rows) },
        source: "observation_compressed",
        confidence: 0.3,  // lower confidence; details are lossy
      },
    }),
    prisma.agentMemory.deleteMany({ where: { id: { in: rows.map(r => r.id) } } }),
  ]);
}
```

### Anti-Patterns to Avoid
- **One shared cron tick that loops all tenants:** Don't do `cron("0 7 * * *", async () => { for (tenant of tenants) await runBriefing(tenant) })`. That serialises Anthropic calls, hides per-tenant failures in the loop, and breaks the existing BullMQ Worker concurrency contract. **Use one `JobScheduler` per `ScheduledBriefing` row** (Pattern 1).
- **Caching the user prompt instead of the system prompt:** Per-tenant statistics in the user prompt change every call — caching the user portion means zero cache hits. **Cache the system prompt only; per-tenant context goes in `messages[]`** (Pattern 2 [CITED: platform.claude.com prompt-caching gotcha]).
- **Trust math in the executor body (`execute()` function):** Don't litter each action tool's `execute()` with `if (tenant.trustLevel >= 2) { skipApproval }` — that's 10 copy-pasted gate checks and inevitable drift. **Trust gate lives once in `registry.ts.invoke()`**, before the existing approval gate.
- **Synchronous AgentMemory writes during agent runs:** A 90-day-old memory row blocks no read; pruning is daily, not per-write. Don't introduce a write-time "did this overflow some quota?" check.
- **Hardcoded partner-API URLs in source:** Different tenants will eventually have different sandbox/prod endpoints. Store `baseUrl` alongside the encrypted secret in `Tenant.partnerApiSecrets`.
- **Bilingual briefing body assembled in TypeScript:** Don't render two paragraphs with template strings then concatenate. **Ask the model for both languages** in one response with a structured JSON output (`{ english: "...", arabic: "..." }`) — Claude Sonnet 4.6 handles Arabic natively and the model has the full context to translate idioms correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurring cron jobs across many tenants | Custom `setInterval` loop or node-cron singletons | BullMQ `upsertJobScheduler` (already shipping in Phase 4) | Survives restart, idempotent, per-job retries, observable via BullMQ board |
| Anthropic prompt fan-out cost reduction | Custom in-memory caching of completed responses | `cache_control: ephemeral` on system prompt | 0.1× read cost; refreshes TTL automatically on hit; no cache invalidation logic |
| AES encryption for partner-API tokens | New crypto wrapper | Reuse `backend/src/utils/portalCreds.ts` `encryptCred`/`decryptCred` | Already tested + already in use for Keeta portal scraper credentials |
| Email send from a worker | New SMTP client | `notificationChannels.sendEmail` (SendGrid + Resend + Nodemailer fallback chain) | Already wired; just call it |
| Per-tenant rate limiting | Postgres counter table with row locks | Redis sorted-set sliding-window-log | Postgres counter at 6 fleets × N calls/min is row-lock contention; Redis is built for this |
| Multi-language briefing rendering | i18next + templates per role × per language | One Anthropic call with structured output `{ english, arabic }` | Idioms and tone don't survive template substitution; the model sees the full daily context and writes both in one pass |
| Cron expression validation | `cron-validate` or `cron-parser` | The existing `validateCron` whitelist in `services/scheduledBriefingsService.ts:46-75` | The whitelist (`"0 6 * * *"`, `"0 7 * * *"`, `"0 17 * * *"`, `"0 6 * * 1"` + admin custom) is already enforced; extend with `"0 18 * * *"` for evening briefings |

**Key insight:** Phase 11's "new code" is mostly *configuration* of primitives Phases 1–9 already shipped. The big risks are (a) cost drift from un-cached Anthropic calls, (b) trust math regressions when an upstream agent change perturbs `confidence`, and (c) the partner-API outreach being premature (per ROADMAP it's gated on 5+ paying fleets, which is itself gated on Phase 8 shipping).

## Runtime State Inventory

**Not applicable** — Phase 11 is a greenfield phase that adds new behaviour. There is no rename or refactor of existing strings/registrations. The closest thing is the addition of two columns to the `Tenant` table (`briefingMorningTime`, `briefingEveningTime`, `trustLevel`, `autoApproveCapDaily`, `partnerApiSecrets`) which is a standard additive migration with backfill defaults (already a hardened pattern in `20260510000000_decisions_billing_admin_models`).

## Common Pitfalls

### Pitfall 1: One BullMQ worker is a serial bottleneck across tenants
**What goes wrong:** Phase 4 wires `concurrency: 2` on the briefings worker (`scheduledBriefingsWorker.ts:349`). At 6+ tenants × 2 briefings/day fanning out into a ~20-second window each, ticks queue up and some briefings fire 30+ seconds late.
**Why it happens:** BullMQ's JobScheduler issues each tick as a normal job; Worker concurrency caps simultaneous processing. With one worker and `concurrency: 2`, three briefings starting at the same cron tick serialize.
**How to avoid:** Bump worker concurrency to 5 (each tick is ~95% Anthropic-I/O-bound, not CPU); add a `metricEvent.scheduled_briefing_late` if tick-to-completion > 60s. Don't run two worker processes against the same queue without per-tenant locking — BullMQ delivers each job to exactly one worker but a stuck worker can cause delivery to retry on another.
**Warning signs:** SendGrid timestamps in delivered emails drift more than 30s past the cron tick.

### Pitfall 2: Auto-approve confidence drift from agent prompt changes
**What goes wrong:** A Phase 11 trust gate keyed off `confidence > 0.8` works on Wave 1's monitor prompt. Wave 3 tweaks the prompt to be more decisive; suddenly confidence values trend higher and the auto-approve rate doubles overnight.
**Why it happens:** The agent's self-reported confidence is a soft signal that drifts whenever the prompt changes; there's no calibration target.
**How to avoid:** (a) Track `auto_approved` MetricEvent with the confidence at time of decision so drift is observable, (b) gate auto-approve also on `confidence > 0.8 AND historicalApprovalRate > 0.85 for this tool` (compute from `AgentAction` table over last 30 days), (c) require any prompt change to ship alongside a check that confidence-distribution on a fixture set hasn't shifted by >0.1.
**Warning signs:** `rolledBackAt` count climbs in the 7 days after a prompt deploy.

### Pitfall 3: Memory pruning deletes founder-set context
**What goes wrong:** A daily prune worker hard-deletes rows older than 90 days. The founder set `owner.preferences.warning_day = "Friday"` 91 days ago via an admin tool; the agent reverts to its default.
**Why it happens:** The pruner sees "old" as "stale"; founder-pinned context is rarely re-asserted because it never changes.
**How to avoid:** Three-source exemption list — never prune `source = 'founder_pinned'`, never prune `source = 'user_correction'`, never prune `key LIKE 'dismissed:%'` (those are needed for the 7-day rejection-suppression contract documented in `monitor.md`).
**Warning signs:** Sudden agent behaviour regression on the day after a prune run.

### Pitfall 4: Briefing timing collisions across tenants share the same cron
**What goes wrong:** All tenants default to `briefingMorningTime = "07:00"` so all of them fire at `0 7 * * *` simultaneously. The Anthropic rate limit (per-org tokens/minute) kicks in and some briefings get HTTP 429.
**Why it happens:** Naïve defaulting + Anthropic API limits scale per organization, not per ScheduledBriefing.
**How to avoid:** Default to a deterministic stagger — `briefingMorningTime` defaults to `07:00 + (hash(tenantId) % 5) minutes` so 5 tenants spread across 07:00–07:04. Add a single retry with 30s backoff on 429.
**Warning signs:** `scheduled_briefing_failed` metric event with `error: "rate_limit_exceeded"`.

### Pitfall 5: Partner-API credentials in environment variables
**What goes wrong:** The Keeta partner-API integration ships first; engineer puts the test credential in `.env` as `KEETA_PARTNER_API_KEY`. A new tenant onboards and asks why it doesn't work — turns out the env var is global.
**Why it happens:** Multi-tenant credentials must be DB-scoped per tenant, not process-scoped.
**How to avoid:** Mandate `Tenant.partnerApiSecrets: Json` (encrypted via `portalCreds.ts`), shape `{ KEETA: { encryptedKey, baseUrl, fleetId, updatedAt }, TALABAT: {...}, DELIVEROO: {...} }`. The env var route is for the *encryption key only* (`PORTAL_CRED_KEY`), never for tenant secrets.
**Warning signs:** A second tenant onboards and the integration "doesn't work" — symptom of env-scoped instead of tenant-scoped credentials.

### Pitfall 6: Trust graduation re-armed too aggressively after a rollback
**What goes wrong:** Tenant T had a rollback 8 days ago. Trust math resets `rollbacks30d` once that row crosses the 30-day cutoff, so auto-approve re-engages on day 31 — but the underlying behaviour pattern that caused the rollback hasn't been addressed.
**Why it happens:** A flat 30-day window is too forgiving for trust-violating events.
**How to avoid:** Per-tool **demotion window** — when a tool's action is rolled back, that *tool* loses auto-approve for that tenant for 60 days (not 30), even if other tools stay auto-approve. The founder can override via `POST /api/admin/tenants/:id/trust` to re-enable earlier. Each tool gets its own `lastRollbackAt` in `Tenant.toolTrustState` JSON.
**Warning signs:** Repeat rollbacks for the same tool from the same tenant pattern.

### Pitfall 7: Prompt cache fragmentation from per-tenant context in system prompt
**What goes wrong:** Engineer wants to personalise the briefing system prompt with tenant name → puts `"You are the morning briefer for ${tenantName}"` in the system prompt. Cache hit rate drops to zero.
**Why it happens:** Cache key is a hash of the literal system prompt text. Any tenant variable in the cacheable prefix invalidates the cache per-tenant.
**How to avoid:** Hold tenant-specific context to the `messages[]` array; the system prompt stays tenant-agnostic ("You are Darb's morning briefer. The tenant name and stats appear in the first user message…"). [CITED: platform.claude.com prompt-caching gotcha — "Don't place breakpoints on changing content"]
**Warning signs:** `cache_read_input_tokens: 0` on every briefing call.

### Pitfall 8: Trust gate fires before the registry sets up the audit context
**What goes wrong:** Phase 11 insertion writes the `AgentAction` row inside the trust gate but before the execute call. If execute throws, the audit row says `outcome: "success"` despite the failure.
**Why it happens:** The existing `invoke()` writes audit *after* execute returns. Phase 11's insertion needs to follow that contract.
**How to avoid:** Write the audit row **after** the execute call returns, in the same try/catch block as the regular path — i.e. when `outcome` is known. The trust decision itself can be cached in a const before execute; the audit row is the last write of the success path.
**Warning signs:** `AgentAction.outcome = success` rows correlated with `agentToolCall.error` rows on the same `agentRunId`.

## Code Examples

### Adding the `source = "auto"` audit row from trust gate
```typescript
// Source: extension of backend/src/agent/ledger.ts:55-83 (existing writeAgentAction)
// The ledger already supports source: "auto" (ledger.ts:31 + schema default).
// Phase 11 just needs a wrapper that synthesises approverUserId.

const SYSTEM_AUTO_APPROVE_USER_ID = "system:auto-approve";

export async function writeAutoApprovedAction(opts: {
  tenantId: string;
  toolName: string;
  originalProposal: unknown;
  outcome: "success" | "failure";
  reasoning: string;
  errorMessage?: string;
  modelName?: string;
  agentRunId?: string;
}): Promise<{ id: string }> {
  return writeAgentAction({
    ...opts,
    approverUserId: SYSTEM_AUTO_APPROVE_USER_ID,
    source: "auto",
  });
}
```

### Provisioning briefings at tenant onboarding
```typescript
// Source: new file backend/src/services/briefingProvisionService.ts
// Called from existing backend/src/services/onboarding/ flow.
import * as briefings from "./scheduledBriefingsService";

const STAGGER_MIN = 5;

export async function provisionDefaultBriefings(opts: {
  tenantId: string;
  ownerUserId: string;
  dispatcherUserId?: string;
  accountantUserId?: string;
}): Promise<void> {
  const stagger = parseInt(opts.tenantId.slice(0, 8), 16) % STAGGER_MIN;
  // Owner — daily morning + evening
  await briefings.createBriefing({
    tenantId: opts.tenantId,
    userId: opts.ownerUserId,
    userRole: "ADMIN",
    name: "Owner — morning",
    cron: `${stagger} 7 * * *`,
    prompt: BRIEFING_OWNER_MORNING_PROMPT,
    type: "briefing",
    channels: ["in_chat", "email"],
  });
  await briefings.createBriefing({
    tenantId: opts.tenantId,
    userId: opts.ownerUserId,
    userRole: "ADMIN",
    name: "Owner — evening",
    cron: `${stagger} 18 * * *`,
    prompt: BRIEFING_OWNER_EVENING_PROMPT,
    type: "briefing",
    channels: ["in_chat", "email"],
  });
  // Accountant — weekly Monday cash digest
  if (opts.accountantUserId) {
    await briefings.createBriefing({
      tenantId: opts.tenantId,
      userId: opts.accountantUserId,
      userRole: "ACCOUNTANT",
      name: "Accountant — weekly cash",
      cron: `${stagger} 6 * * 1`,
      prompt: BRIEFING_ACCOUNTANT_PROMPT,
      type: "briefing",
      channels: ["in_chat", "email"],
    });
  }
  // Dispatcher — daily 07:00 pre-brief
  if (opts.dispatcherUserId) {
    await briefings.createBriefing({
      tenantId: opts.tenantId,
      userId: opts.dispatcherUserId,
      userRole: "OPS_MANAGER",
      name: "Dispatcher — floor pre-brief",
      cron: `${stagger} 7 * * *`,
      prompt: BRIEFING_DISPATCHER_PROMPT,
      type: "briefing",
      channels: ["in_chat"],
    });
  }
}
```

### Daily memory pruning job
```typescript
// Source: new file backend/src/queues/memoryPruneWorker.ts
// Pattern follows scheduledBriefingsWorker.ts (Phase 4 reference).
import { Queue, Worker } from "bullmq";
import { prisma } from "../config";
import { recordMetricEvent } from "../agent/metricEvent";
import { compactMemoriesForTenant } from "../agent/memoryCompactor";

export const MEMORY_PRUNE_QUEUE = "memory-prune";

export async function processPruneTick(): Promise<{
  tenantsProcessed: number;
  rowsDeleted: number;
}> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let rowsDeleted = 0;
  for (const t of tenants) {
    // Hard delete stale observations older than 90d
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const del = await prisma.agentMemory.deleteMany({
      where: {
        tenantId: t.id,
        createdAt: { lt: cutoff },
        source: { notIn: ["founder_pinned", "user_correction"] },
        key: { not: { startsWith: "dismissed:" } },
      },
    });
    rowsDeleted += del.count;
    // Compress remaining observation rows
    await compactMemoriesForTenant(t.id);
    await recordMetricEvent({
      tenantId: t.id,
      event: "memory_pruned",
      properties: { rowsDeleted: del.count, cutoff: cutoff.toISOString() },
    });
  }
  return { tenantsProcessed: tenants.length, rowsDeleted };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anthropic prompt caching with single 5-min ephemeral | Two TTLs available: 5-min + 1-hour | Anthropic Feb 2026 [CITED: platform.claude.com] | 1-hour TTL is right for daily briefings — 5-min wouldn't survive between 07:00 fan-out tenants spread over 5 minutes |
| BullMQ repeat-options (deprecated) | BullMQ JobScheduler (5.x) | BullMQ 5.0 release [CITED: docs.bullmq.io] | Already in use in Phase 4; Phase 11 just adds more `upsertJobScheduler` calls |
| Trust-as-a-feature-flag (binary on/off per tenant) | Trust-as-tier-per-tool (per-tenant × per-tool with confidence + rollback decay) | Phase 11 design | Lets `draftCourierMessage` graduate without exposing `applyPenalty` |
| AgentMemory append-only forever | Append-only with daily compaction | Phase 11 design | Solves index bloat at 90+ days × 6+ tenants without breaking append-only contract |

**Deprecated/outdated:**
- Phase 1 Wave 0's `lint:tenant` narrow scope (DI-01-01): 184 violations should be fully triaged in Phase 11 Wave 4.
- Phase 1 Wave 4 hand-crafted migration via `prisma migrate resolve --applied` (DI-01-02): should be replaced with a clean baseline this phase.
- Brute string concatenation for bilingual messages (used in Phase 9 stubs): replace with structured Anthropic output `{ english, arabic }` in briefings.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 11 starts only after Phase 8 + Phase 9 ship (action tools + bilingual outbound) | All sections | If Phase 9 slips, briefings touching couriers can't be bilingual — drop Arabic for Phase 11 owner/accountant briefings, keep English-only |
| A2 | The narrator agent prompt at `prompts/narrator.md` is the right starting point for briefing prompts | Pattern 1, briefingProvisionService | If briefings need different tone (operator-speak vs owner-speak), three separate prompts emerge instead of one with role parameter — already accommodated in proposed file layout |
| A3 | SendGrid is the canonical email channel (vs Resend or Nodemailer) | Architecture diagram | `notificationChannels.ts` has fallback chain so either provider works; A3 only affects which env vars are required |
| A4 | 50 auto-approved actions per tenant per day is the right default cap | Pattern 4 + Pitfall 6 | Too low → trust feels degraded by quota; too high → bad-prompt blowups go too far. Founder-tunable per tenant via the admin UI |
| A5 | Trust math reads `Tenant.trustLevel` as integer (0/1/2/3 = v1/v2-light/v2-full/v3) | Pattern 3 | If a separate `trustLevel` per-tool is preferred from day 1 (no tenant-wide level), refactor into JSON. Recommend starting tenant-wide for simplicity |
| A6 | 1-hour Anthropic prompt cache TTL is right for daily briefings | Pattern 2 | If the briefing prompt changes frequently during development the cache breaks anyway; ttl: "1h" only hurts on the rare day a prompt redeploys mid-day |
| A7 | Partner-API conversations for Keeta + Talabat are formal-but-not-contractual in Phase 11 (per ROADMAP) | Pattern in partnerApi/ skeleton | If founder closes a contract, the Keeta adapter needs to be production-quality not skeleton. Defer Talabat + Deliveroo to Phase 12 if Keeta is the only signed deal |
| A8 | The 184 lint:tenant violations from DI-01-01 are reducible to ≤30 real bugs + ~150 false positives needing `eslint-disable-next-line` comments | Phase 11 Dependencies | If real-bug count is higher, Wave 4 of Phase 11 grows from 1 day to 3 days |
| A9 | DI-01-02 baseline migration can be solved by a single `CREATE TABLE IF NOT EXISTS` baseline migration | Phase 11 Dependencies | If multiple historical migrations need consolidation, requires a `prisma migrate resolve --applied` dance across all dev environments |

## Open Questions

1. **Where does `Tenant.trustLevel` default for new tenants?**
   - What we know: Phase 1 design assumed v1 (propose-and-confirm always). Phase 11 starts at v2.
   - What's unclear: Should a brand-new tenant onboard at trustLevel=0 (v1) and graduate after 30 days of clean history, or at trustLevel=2 (v2) from day 1?
   - Recommendation: Default to 0; graduate to 2 only after 30 days of `AgentAction.outcome = success` rate ≥ 95% (auto-computed by a worker, not founder-set). Founder-set tenants (design partners) can be promoted to 2 immediately via admin tool.

2. **Should auto-approved actions be visible in the Decisions inbox at all?**
   - What we know: Phase 2's `/decisions` UI shows `PendingAgentAction` rows. Auto-approved actions write directly to `AgentAction` (no pending state).
   - What's unclear: Does the owner want a daily "what Darb did without asking" feed in Decisions, or only in the chat history surface, or only in the morning briefing summary?
   - Recommendation: Surface in the morning briefing ("Darb auto-handled 12 routine pings overnight") AND make them filterable in `/decisions/audit` (already exists per Phase 2). Don't pollute the main `/decisions` inbox — that surface is for pending decisions.

3. **What happens when a partner-API integration goes live mid-month — does it backfill?**
   - What we know: Phase 6 ingest adapters write `IngestRun` audit rows + upsert per-platform Daily metrics.
   - What's unclear: When Keeta partner-API switches on, do we ingest just-today onward, or backfill the last 30 days?
   - Recommendation: Backfill 30 days as part of onboarding (same as portal scraper). Add `?from=&to=` query params to the partner adapter and run a one-time backfill job at integration enable.

4. **Are evening briefings sent if the tenant didn't run any shifts that day?**
   - What we know: A tenant that closed for Eid still has the cron tick fire.
   - What's unclear: Should the agent decide to skip ("nothing happened today, no briefing") or always send something?
   - Recommendation: Always send — the briefing text says "no shifts today; ops nominal" rather than skipping. A missing briefing is harder for the owner to detect than a quiet one. Borrow phrasing from `narrator.md` ("Ops nominal — no new clusters since last briefing").

5. **DI-01-02 baseline migration — squash all migrations or single baseline?**
   - What we know: Current dev DB state can be dumped via `pg_dump --schema-only`. There are 30+ migrations.
   - What's unclear: Squash everything into one baseline (simpler future devs, breaks `migrate diff` history) vs. add `CREATE TABLE IF NOT EXISTS` to the earliest ALTER migrations (preserves history but is per-table surgical work).
   - Recommendation: Surgical fix — only `PlatformSettings` and `Notification` have the bug. Two `CREATE TABLE IF NOT EXISTS` prepends in the relevant migrations + `migrate dev` smoke from a fresh DB to confirm. Don't touch unrelated migrations.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis 7 | BullMQ JobScheduler + rate limit sorted sets | Assumed (docker-compose) | 7.x | If REDIS_URL is unset the scheduledBriefingsWorker.ts logs "queue disabled" and no-ops — same fallback applies to memoryPruneWorker + partnerApiPullWorker |
| PostgreSQL 15 | Prisma 5 schema | Assumed (docker-compose) | 15 | None — required |
| @anthropic-ai/sdk | Briefing generation | ✓ in package.json | 0.80.0 | None |
| @sendgrid/mail | Briefing email | ✓ in package.json | 8.1.6 | Resend or Nodemailer via `notificationChannels.ts` fallback chain |
| Anthropic API key | Briefing generation | Env var `ANTHROPIC_API_KEY` | n/a | Briefings degrade to "Briefing failed" thread (existing `writeErrorThread` path in scheduledBriefingsWorker.ts:282-320) |
| Sendgrid API key | Briefing email | Env var `SENDGRID_API_KEY` + `SENDGRID_FROM` | n/a | Stub-warn channel returns `{ok: false}` (existing in `notificationChannels.ts:73-87`) |
| `PORTAL_CRED_KEY` 32-byte symmetric key | partnerApiSecrets decryption | Env var | n/a | None — `utils/portalCreds.ts` throws if unset |
| Keeta partner-API endpoint URL + credentials | Keeta partner adapter | ✗ (negotiation pending per ROADMAP) | — | Keep portal scraper running; partner-API adapter ships as feature-flagged code path |
| Talabat partner-API endpoint URL + credentials | Talabat partner adapter | ✗ (negotiation pending) | — | Same — Talabat portal scraper (if exists) or XLSX fallback |
| Deliveroo webhook endpoint | Deliveroo adapter | ✗ (no scraper exists today either) | — | XLSX fallback (Phase 6 reference pattern) |

**Missing dependencies with no fallback:** None block phase execution.

**Missing dependencies with fallback:**
- Partner-API credentials: ship the adapter framework as code-complete-but-feature-flagged; once founder secures credentials, flip the flag per-tenant.
- Email channel: if SendGrid env vars aren't set in dev, briefings still write to ChatThread (the in-chat channel), which is the primary surface anyway.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.9 + supertest 7.2.2 [VERIFIED: backend/package.json] |
| Config file | `backend/jest.config.*` (existing, Phase 1+) |
| Quick run command | `cd backend && npm test -- --testPathPatterns=phase11` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-agent-scheduled-briefings | Briefing fires at tenant.briefingMorningTime; writes ChatThread + Notification + email | integration | `pytest`-equivalent: `npm test -- src/__tests__/queues/scheduledBriefingsWorker.briefing.test.ts` | ❌ Wave 0 |
| REQ-agent-scheduled-briefings | Briefing prompt template selects per-role (owner vs dispatcher vs accountant) | unit | `npm test -- src/__tests__/services/briefingProvisionService.test.ts` | ❌ Wave 0 |
| REQ-agent-scheduled-briefings | Briefing email rendering bilingual when channel includes courier comms | integration | `npm test -- src/__tests__/queues/scheduledBriefingsWorker.bilingual.test.ts` | ❌ Wave 0 |
| REQ-agent-trust-graduation | Tool with autoApprovable=true + tenant.trustLevel=2 + confidence>0.8 + rollbacks30d=0 + within cap → executes, writes AgentAction.source="auto" | integration | `npm test -- src/__tests__/agent/trustGraduation.test.ts` | ❌ Wave 0 |
| REQ-agent-trust-graduation | Tool with autoApprovable=false → always falls through to PendingAgentAction even at trustLevel=3 | integration | `npm test -- src/__tests__/agent/trustGraduation.nonAutoApprovable.test.ts` | ❌ Wave 0 |
| REQ-agent-trust-graduation | Per-tenant rate cap rejects 51st auto-approve in 24h, falls through to PendingAgentAction | unit | `npm test -- src/__tests__/agent/trustGraduation.rateLimit.test.ts` | ❌ Wave 0 |
| REQ-agent-trust-graduation | Recent rollback in 60-day window for tool X demotes that tool only, not all tools | unit | `npm test -- src/__tests__/agent/trustGraduation.demotion.test.ts` | ❌ Wave 0 |
| REQ-agent-long-term-memory | Memory pruner deletes rows older than 90d unless source IN founder_pinned, user_correction | unit | `npm test -- src/__tests__/queues/memoryPruneWorker.test.ts` | ❌ Wave 0 |
| REQ-agent-long-term-memory | Memory pruner compacts observation rows into compressed summaries | unit | `npm test -- src/__tests__/agent/memoryCompactor.test.ts` | ❌ Wave 0 |
| REQ-agent-long-term-memory | latestMemoryByKey after compaction still returns the most-recent verbatim row (compaction doesn't break "current value" semantics) | unit | `npm test -- src/__tests__/agent/memoryCompactor.semantics.test.ts` | ❌ Wave 0 |
| REQ-ingest-partner-api-conversations | Keeta partner adapter decrypts Tenant.partnerApiSecrets, calls baseUrl, writes IngestRun with source=PORTAL_API | integration | `npm test -- src/__tests__/services/ingest/partnerApi/keeta.test.ts` | ❌ Wave 0 |
| REQ-ingest-partner-api-conversations | Adapter falls back gracefully when partnerApiSecrets is null (keeps existing portal scraper running) | unit | `npm test -- src/__tests__/services/ingest/partnerApi/fallback.test.ts` | ❌ Wave 0 |
| REQ-tenant-scoped-everything (regression) | All Phase 11 new code paths pass `lint:tenant` rule | lint | `npm run lint:tenant` | ✓ (script exists) |
| DI-01-01 closeout | Broadened `lint:tenant -- src/` returns exit 0 with all 184 historical violations triaged | lint | `npm run lint:tenant -- src/` | ❌ Wave 4 |
| DI-01-02 closeout | `npx prisma migrate dev --create-only` succeeds from a fresh DB | integration | manual reproduction script `scripts/test-fresh-migrate.sh` | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPatterns=$(echo $TASK_DOMAIN)` — runs the directly-touched test files plus the closest neighbours
- **Per wave merge:** `npm test -- --testPathPatterns='(queues|agent/trust|memory|ingest/partnerApi)'` — runs the full Phase 11 surface
- **Phase gate:** `npm test && npm run lint:tenant && npm run lint` all green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/queues/scheduledBriefingsWorker.briefing.test.ts` — REQ-agent-scheduled-briefings, fire path
- [ ] `backend/src/__tests__/queues/scheduledBriefingsWorker.bilingual.test.ts` — REQ-agent-scheduled-briefings, bilingual
- [ ] `backend/src/__tests__/services/briefingProvisionService.test.ts` — auto-provision flow
- [ ] `backend/src/__tests__/agent/trustGraduation.test.ts` — REQ-agent-trust-graduation, happy path
- [ ] `backend/src/__tests__/agent/trustGraduation.nonAutoApprovable.test.ts` — REQ-agent-trust-graduation, opt-out tools
- [ ] `backend/src/__tests__/agent/trustGraduation.rateLimit.test.ts` — REQ-agent-trust-graduation, cap
- [ ] `backend/src/__tests__/agent/trustGraduation.demotion.test.ts` — REQ-agent-trust-graduation, per-tool demotion
- [ ] `backend/src/__tests__/queues/memoryPruneWorker.test.ts` — REQ-agent-long-term-memory, delete path
- [ ] `backend/src/__tests__/agent/memoryCompactor.test.ts` — REQ-agent-long-term-memory, compress path
- [ ] `backend/src/__tests__/agent/memoryCompactor.semantics.test.ts` — REQ-agent-long-term-memory, latestMemoryByKey still works
- [ ] `backend/src/__tests__/services/ingest/partnerApi/keeta.test.ts` — REQ-ingest-partner-api-conversations
- [ ] `backend/src/__tests__/services/ingest/partnerApi/fallback.test.ts` — REQ-ingest-partner-api-conversations, fallback
- [ ] `backend/scripts/test-fresh-migrate.sh` — DI-01-02 reproduction guard (runs `prisma migrate dev` on a throwaway DB)
- [ ] `backend/src/__tests__/lint/tenantScopeSrc.test.ts` — DI-01-01 reproduction guard (calls `npm run lint:tenant -- src/` and asserts exit 0)
- [ ] Extend `lint:tenant` npm script in package.json to include `src/queues/memoryPruneWorker.ts src/queues/partnerApiPullWorker.ts src/services/ingest/partnerApi/ src/agent/trustGraduation.ts src/agent/memoryCompactor.ts src/services/briefingProvisionService.ts src/routes/admin/trust.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing JWT (15m access + 7d refresh) + `authMiddleware` enforced on all new routes |
| V3 Session Management | yes | Existing session handling preserved; admin trust endpoint requires super-admin middleware |
| V4 Access Control | yes | RBAC + tenantScope middleware on all new routes; `POST /api/admin/tenants/:id/trust` gated by super-admin |
| V5 Input Validation | yes | Zod validators on every new endpoint body; trust config values clamped to allow-list (`trustLevel` ∈ {0,1,2,3}, `autoApproveCapDaily` ∈ [0, 200]) |
| V6 Cryptography | yes | Partner-API secrets encrypted with existing `utils/portalCreds.ts` AES-256-GCM; never log decrypted values; reuse `PORTAL_CRED_KEY` env var |
| V7 Error Handling | yes | Trust-gate failures fall through silently to v1 path (no error visible to agent); auditing writes a MetricEvent so failures are observable |
| V9 Communication | yes | All Anthropic + SendGrid + partner-API calls over HTTPS (default for SDKs); reject HTTP partner-API baseUrls in validator |
| V10 Malicious Code | partial | New Anthropic-generated briefing content rendered into chat as markdown — sanitize via the same renderer used in Phase 4 chat (existing) |
| V12 Files / Resources | n/a | No file upload/download paths added |
| V13 API & Web Services | yes | New `POST /api/admin/tenants/:id/trust` follows existing /admin route conventions; idempotency keys on partner-API pulls |

### Known Threat Patterns for Express 4 + Prisma 5 + BullMQ

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tenant-scope leak in new partner-API adapter | Tampering | `lint:tenant` rule extended to cover `services/ingest/partnerApi/`; integration test asserts cross-tenant `tenantId` in URL path is rejected |
| Trust-graduation bypass via crafted `confidence` value | Elevation of Privilege | `confidence` clamped to [0, 1] by Zod; auto-approve also requires `historicalApprovalRate > 0.85` derived server-side from `AgentAction` (not caller input) |
| Partner-API credentials in BullMQ job data (Redis plaintext) | Information Disclosure | `partnerApiPullWorker` data carries only `tenantId + platform` — credentials fetched and decrypted inside the worker, never serialized to the job payload |
| Briefing email injection (Anthropic returns content with HTML/scripts) | Tampering | Render email body as `text` only (not `html`) in SendGrid call; existing `notificationChannels.sendEmail` already uses `text` parameter [VERIFIED: notificationChannels.ts:81] |
| Memory pruning DoS (delete millions of rows in one tx) | Denial of Service | Prune one tenant at a time + batch delete with `LIMIT 10000` per call inside the worker loop |
| Auto-approve rate-cap bypass via worker concurrency race | Tampering | Redis sorted-set `ZADD` is atomic; check `ZCARD` after the add (commit-then-verify pattern), not before |
| Partner-API webhook replay | Repudiation | Deliveroo webhook receiver verifies HMAC signature + stores `eventId` in `IngestRun.runIdempotencyKey` (already a Phase 6 pattern); reject duplicates |
| BullMQ stuck-worker re-delivery causes double-briefing | Tampering / Data integrity | Each tick writes idempotency key `${briefingId}-${cronTickIso}` to a Redis `SETNX`; second worker attempting the same tick no-ops |

## Project Constraints (from CLAUDE.md)

The project CLAUDE.md (project root) imposes:
- **Tech stack:** Express 4 + TypeScript + Prisma 5 (PostgreSQL 15) + Redis 7 + BullMQ. **All Phase 11 new code lives in this stack — no new runtime, no new framework.**
- **AI provider:** Anthropic Claude API. **All briefing generation uses `@anthropic-ai/sdk` 0.80.0 + model `claude-sonnet-4-6` per `backend/src/agent/config.ts`.**
- **All routes use authMiddleware + tenantScope middleware.** Phase 11's new admin trust route + partner-API config route must follow this convention.
- **Pagination via getPagination() + paginatedResponse() utils.** The trust-history viewer in /admin/trust must use these.
- **Error handling: try/catch in every route, return { error: message }.** Apply to /api/admin/tenants/:id/trust.
- **Frontend: Tailwind utility classes, Shadcn components, Lucide icons.** /admin/trust UI must follow.
- **Arabic/English bilingual support via i18n directory.** Briefing email + Notification rendering uses `titleAr` + `bodyAr` columns added in Phase 9.
- **Platform-specific code lives under platform-named directories.** `services/ingest/partnerApi/{keeta,talabat,deliveroo}.ts` honours this.

Additionally, the Phase 1 deferred items file at `.planning/phases/01-backend-agent-spine-data-architecture/deferred-items.md` explicitly names Phase 11 as the owner of DI-01-01 (lint:tenant broadening) and DI-01-02 (migration baseline). Both are in-scope for this phase.

## Sources

### Primary (HIGH confidence)
- `backend/src/queues/scheduledBriefingsWorker.ts` (Phase 4 shipped code) — BullMQ JobScheduler pattern reference
- `backend/src/agent/registry.ts:120-200` — tool invocation gate where Phase 11 inserts the trust check
- `backend/src/agent/ledger.ts` — `writeAgentAction` shape; `source: "auto"` already supported
- `backend/src/agent/memory.ts` — append-only `AgentMemory` contract; `latestMemoryByKey` semantics
- `backend/src/services/notificationChannels.ts` — SendGrid + Twilio + Resend + Nodemailer fallback chain
- `backend/src/utils/portalCreds.ts` — AES-256-GCM helpers to reuse for partner-API secrets
- `backend/src/services/scheduledBriefingsService.ts` — cron whitelist + create/update/delete CRUD
- `backend/prisma/schema.prisma:2304-2479` — AgentMemory + ScheduledBriefing + AgentAction (incl. source/rolledBackAt fields)
- `.planning/PROJECT.md` (DEC-trust-graduated-autonomy, CON-rate-limits-v2-autonomy)
- `.planning/REQUIREMENTS.md` (REQ-agent-scheduled-briefings, REQ-agent-trust-graduation, REQ-agent-long-term-memory, REQ-ingest-partner-api-conversations)
- `.planning/phases/01-backend-agent-spine-data-architecture/deferred-items.md` (DI-01-01, DI-01-02)
- platform.claude.com/docs/en/build-with-claude/prompt-caching — cache_control TTLs, hierarchy, gotchas
- api.docs.bullmq.io/classes/v5.Queue.html#upsertjobscheduler — JobScheduler API

### Secondary (MEDIUM confidence)
- docs.bullmq.io/guide/job-schedulers — job production mechanism (less detailed than the API ref)

### Tertiary (LOW confidence)
- None. Every recommendation traces to either the codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already in package.json; verified against installed versions.
- Architecture: HIGH — Phase 4's `scheduledBriefingsWorker.ts` is the proven reference for Phase 11's three new BullMQ workers; the trust gate is a single-file insertion at a well-defined extension point.
- Pitfalls: HIGH — every pitfall is either documented in Anthropic/BullMQ official docs or directly observable in existing codebase patterns (e.g., concurrency: 2 in scheduledBriefingsWorker.ts line 349).
- Trust graduation design: MEDIUM-HIGH — the per-tool flag + per-tenant state split is a reasoned design choice; founder confirmation needed on Q1 (default trust level for new tenants) and Q2 (whether auto-approved actions surface in /decisions inbox at all).
- Partner-API outreach: MEDIUM — Keeta is the only platform with a known portal-scraper today; Talabat and Deliveroo partner-API contracts are speculative per ROADMAP gating on "5+ paying fleets".
- Memory pruning: HIGH — append-only semantics preserved via compaction; existing `latestMemoryByKey` (orderBy createdAt desc) continues to work without modification.

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days — stable stack, slow-moving Anthropic API; revisit if BullMQ ships 6.x or Anthropic Sonnet 4.7 lands)
