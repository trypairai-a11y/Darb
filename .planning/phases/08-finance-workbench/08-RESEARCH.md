# Phase 8: Finance Workbench + Action Tool Surface (the moat) — Research

**Researched:** 2026-05-13
**Domain:** Accountant workbench (cash / payroll / invoices / P&L) + the full 10-tool live action surface promoted from Phase 2 audit-only stubs to propose-and-confirm with real side effects.
**Confidence:** HIGH for primitives that already exist in the repo (AgentAction ledger, PendingAgentAction optimistic-lock pattern, prismaExtensions tenant guard, decisions surface plumbing, Notification.category bilingual fields). MEDIUM for the seven new tools that have monitor-prompt hints but no implementation. LOW for accountant-UX specifics (Recharts P&L chart shapes, payroll bank-file format) where the PRD is non-prescriptive.

## Summary

Phase 8 is the moat phase. The roadmap calls it that explicitly: every tool the agent has been *proposing* since Phase 2 lands a real side effect, and the accountant gets a focused workspace surface that ties cash, payroll, invoices, and P&L together. Three categories of work:

1. **Promote seven audit-only / not-yet-built tools to live** — `applyPenalty`, `suspendDriver`, `reassignShift`, `recordCashSettlement`, `sendCourierMessage`, `createTrainingTask`, `escalateToHumanSupervisor`, `generatePayrollAdjustment`. Two of these (`proposeCashReminder`'s live successor and `flagForReview`) already exist as stubs; the rest are new. Every tool reuses the Phase 2 propose-and-confirm pipeline end-to-end (`PendingAgentAction` → `/decisions/:id/approve` → `toolRegistry.invoke` with `ctx.userId` set → execute body → `writeAgentAction`).
2. **Ship `/finance/*` for the accountant role** — Cash (Keeta/Talabat/Deliveroo, Americana explicitly excluded per CON-cash-platform-coverage), Payroll, Invoices (four platforms), Expenses & P&L. Default landing for `role === "ACCOUNTANT"`. Re-uses the existing CashRecord / CashTransaction / PendingDuesLedger / Violation / Penalty data model — no greenfield finance schema needed, only `BankFile`, `Invoice`, `Expense`, and `PayrollRun` additions.
3. **Workbench shell** — left-rail nav (Cash → Reconciliation → Penalties → Suspensions → Adjustments → Action History) wrapping the surfaces from #2 in a single accountant-mode chrome. The "Action History" tab is the audit log read view backed by `/api/audit/agent-actions` from Phase 2.

**Primary recommendation:** Build the seven new action tools first (Wave 1), then the Cash workbench surface (Wave 2), then Payroll + Invoices + P&L (Wave 3), and the History/Rollback shell last (Wave 4). Every tool gets its execute body inside `prisma.$transaction(async (tx) => {…})` so the side effect + `writeAgentAction` audit row are atomic — if either fails the row is never written and the world doesn't half-mutate. [VERIFIED: prisma.io/docs/orm/prisma-client/queries/transactions]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live action tool execution (`applyPenalty` etc.) | API / Backend | — | All money / status / schedule mutations live in the agent module; UI is thin. Action execution is the moat per Product Principle 2. |
| Cash reconciliation logic (expected vs collected, age buckets) | API / Backend | Frontend Server (SSR for `/finance/cash`) | Aggregation must be tenant-scoped + Decimal-safe; only the surface chart prep belongs in SSR. |
| Workbench shell + tab navigation | Frontend Server (Next.js 14 App Router) | Browser | Standard App Router segment; auth/role lookup at the layout level redirects non-ACCOUNTANT users away. |
| Action confirm card / Approve / Modify / Dismiss | Browser | API / Backend | Existing Phase 2 `<DecisionCard />` is reused — Phase 8 tools just register and inherit the surface. |
| Rollback workflow (`/agent-actions/:id/rollback`) | API / Backend | Browser | The endpoint exists from Phase 2; Phase 8 expands the per-tool rollback handlers. |
| Payroll bank-file export | API / Backend | — | Generates a CSV/PRN per Kuwait bank format; streamed download, not a React tree. |
| P&L month/quarter charts | Browser | Frontend Server | Recharts is already pinned (^3.8.1 frontend); aggregation happens server-side. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | `^5.22.0` (already pinned) | Interactive transactions wrap each live tool's `execute()` body | The propose-and-confirm contract requires atomicity between the side effect and the audit row. [VERIFIED: backend/package.json] |
| `prisma` | `^5.22.0` | Migration tooling for new finance models | Same. [VERIFIED] |
| `zod` | `^3.23.8` | Tool input validators (re-uses the `defineTool` pattern) | All seven new tools use the same Zod-strict pattern as `draftCourierMessage`. [VERIFIED: agent/registry.ts:216] |
| `bullmq` | `^5.73.4` | Scheduled bank-file export + monthly P&L close jobs | Reuse the existing BullMQ infrastructure that Phase 1's scheduler already runs. [VERIFIED] |
| `decimal.js` (via Prisma `Decimal`) | bundled with Prisma 5 | Cash math (`Decimal @db.Decimal(10, 3)`) | KD has 3 decimal places (1000 fils). Never use JS `number` for cash; Decimal is already used in CashRecord/CashTransaction. [VERIFIED: schema.prisma:CashRecord] |
| `next` | `14.2.35` | App Router segments for `/finance/*` | Pinned per CON-stack-frontend. [VERIFIED: frontend/package.json] |
| `recharts` | `^3.8.1` | P&L month/quarter chart | Already used in Phase 3 Driver File trend; same pattern. [VERIFIED] |
| `@tanstack/react-query` | `^5.99.0` | Client cache for the workbench tabs | Already used by Decisions; same pattern. [VERIFIED] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `xlsx` | already vendored | Reads imported expense / invoice spreadsheets | When the accountant uploads platform invoice PDFs/CSVs and we accept a fallback `.xlsx` per CON-xlsx-fallback. [VERIFIED: cash.ts uses it] |
| `papaparse` | not yet installed | CSV streaming for bank-file export | Standard for streaming row-by-row CSV writes; alternative is hand-roll a `Transform` stream. [ASSUMED — confirm during Wave 3] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Optimistic-lock `updateMany` (Phase 2 pattern) | `prisma.$transaction` with `SERIALIZABLE` isolation | The Phase 2 pattern is simpler and proven (188/188 tests). Reserve SERIALIZABLE for the dual-tenant concurrent rollback case where ordering matters across tables. [CITED: prisma.io/docs] |
| New `PenaltyApplication` table | Re-use `Penalty` + `Violation` join (already exists) | The data model already supports `penalty.violations` as implicit m2m. No schema bloat needed. [VERIFIED: schema.prisma:Penalty] |
| Custom bank-file format | Mirror existing Kuwait bank CSV format (KW IBAN + 3-decimal amount) | Founder-gated choice; default to the KFH/NBK/Boubyan-compatible CSV the accountant already exports manually. [ASSUMED — confirm with design partner #1] |

**Installation:**

```bash
# Backend (run from backend/)
npm install papaparse @types/papaparse
# No new prisma plugins; migration only.
```

**Version verification:** All existing libraries are pinned at versions already in `package.json` — no upgrade required. `papaparse` is the only new dependency; verify against the npm registry during Wave 0 (the planner can do `npm view papaparse version` against the current registry). [VERIFIED: backend/package.json read 2026-05-13]

## Architecture Patterns

### System Architecture Diagram

```
                                ACCOUNTANT (ACCOUNTANT role)
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │  /finance (Next.js layout, role gate)    │
              │  ├─ /finance/cash         (default)      │
              │  ├─ /finance/payroll                     │
              │  ├─ /finance/invoices                    │
              │  ├─ /finance/expenses                    │
              │  └─ /finance/history (Action Log)        │
              └────────┬─────────────────────────────────┘
                       │  fetch via @tanstack/react-query
                       ▼
        ┌──────────────────────────────────────┐
        │  Express API (Phase 1 server.ts)     │
        │  ├─ /api/cash/*         (existing)   │
        │  ├─ /api/penalties/*    (existing)   │
        │  ├─ /api/violations/*   (existing)   │
        │  ├─ /api/finance/payroll  NEW        │
        │  ├─ /api/finance/invoices NEW        │
        │  ├─ /api/finance/expenses NEW        │
        │  ├─ /api/finance/pnl      NEW        │
        │  ├─ /api/decisions/:id/approve  ← reused (Phase 2)
        │  └─ /api/audit/agent-actions/:id/rollback ← reused
        └────────┬─────────────────────────────┘
                 │
                 ▼  (action approval path)
        ┌──────────────────────────────────────┐
        │  toolRegistry.invoke(toolName, ctx)  │
        │  where ctx.userId is set →           │
        │  falls through to .execute()         │
        └────────┬─────────────────────────────┘
                 │
                 ▼  (each tool's execute body)
        ┌──────────────────────────────────────┐
        │  prisma.$transaction(async (tx) => { │
        │    // mutate the world               │
        │    // — Driver.status = "SUSPENDED"  │
        │    // — Penalty.create(...)          │
        │    // — Shift.update(...)            │
        │    // — Notification.create(...)     │
        │    // — CashTransaction.create(...)  │
        │  })                                  │
        └────────┬─────────────────────────────┘
                 │
                 ▼
        ┌──────────────────────────────────────┐
        │  writeAgentAction({ outcome, ...})   │
        │  →  AgentAction row (rolledBackAt    │
        │      null; subject = mutated entity) │
        └────────┬─────────────────────────────┘
                 │
                 ▼
        publishEvent("agent_action_resolved")
        →  SSE notifies /decisions surface
        →  (Phase 11) feedback loop into AgentMemory
```

The arrows show that **every live action tool funnels through the same Phase 2 approve route** — no parallel approval surface, no parallel ledger writer. The work in Phase 8 is to fill in the seven new `execute()` bodies and to ship the `/finance/*` accountant surface that talks to existing routes.

### Recommended Project Structure

```
backend/src/
├── agent/tools/action/
│   ├── _legacy/                    # (existing — pre-Phase-1 audit copies)
│   ├── draftCourierMessage.ts      # (Phase 2 — live)
│   ├── flagForReview.ts            # (Phase 2 — audit-only, becomes live)
│   ├── proposeCashReminder.ts      # (Phase 2 — audit-only)
│   ├── applyPenalty.ts             # NEW — Wave 1
│   ├── suspendDriver.ts            # NEW — Wave 1
│   ├── reassignShift.ts            # NEW — Wave 1
│   ├── recordCashSettlement.ts     # NEW — Wave 1 (live successor to proposeCashReminder)
│   ├── sendCourierMessage.ts       # NEW — Wave 1 (chained from draftCourierMessage)
│   ├── createTrainingTask.ts       # NEW — Wave 1
│   ├── escalateToHumanSupervisor.ts# NEW — Wave 1
│   ├── generatePayrollAdjustment.ts# NEW — Wave 1
│   └── index.ts                    # add 8 new side-effect imports
├── routes/
│   ├── financePayroll.ts           # NEW — Wave 3
│   ├── financeInvoices.ts          # NEW — Wave 3
│   ├── financeExpenses.ts          # NEW — Wave 3
│   ├── financePnl.ts               # NEW — Wave 3
│   ├── cash.ts                     # EXISTING — extend with /reconciliation endpoint
│   ├── decisions.ts                # EXISTING — extend PHASE_2_LIVE_TOOLS → PHASE_8_LIVE_TOOLS in cardProjector
│   ├── audit.ts                    # EXISTING — extend rollback dispatcher per-tool
│   └── penalties.ts                # EXISTING — Phase 8 wires applyPenalty into this
└── services/
    ├── finance/                    # NEW — Wave 2/3
    │   ├── reconciliation.ts       # gap detection (expected vs collected)
    │   ├── payrollComputer.ts      # weekly pay + violation deductions
    │   ├── bankFileExporter.ts     # CSV stream
    │   ├── pnlAggregator.ts        # month/quarter cuts
    │   └── rollbackDispatcher.ts   # per-tool reverse-mutation handlers
    └── decisions/
        └── cardProjector.ts        # EXISTING — promote 7 tools out of `phase-8-disabled` allowlist

frontend/src/app/(dashboard)/
└── finance/                        # NEW — Wave 4
    ├── layout.tsx                  # role gate + left-rail nav
    ├── page.tsx                    # → redirect to /finance/cash
    ├── cash/
    │   ├── page.tsx
    │   └── components/
    │       ├── ReconciliationGrid.tsx
    │       ├── AgeBuckets.tsx
    │       └── CashReminderInbox.tsx
    ├── payroll/
    │   ├── page.tsx
    │   └── components/
    │       └── PayrollRunTable.tsx
    ├── invoices/page.tsx
    ├── expenses/page.tsx
    └── history/
        └── page.tsx                # reads /api/audit/agent-actions
```

### Pattern 1: Promote a Phase-2 audit-only tool to live

```typescript
// agent/tools/action/recordCashSettlement.ts
// Source: agent/tools/action/draftCourierMessage.ts (canonical live-tool pattern)
import { z } from "zod";
import { prisma } from "../../../config";
import { defineTool, toolRegistry } from "../../registry";

export const recordCashSettlement = defineTool({
  name: "recordCashSettlement",
  description: "Record a driver cash settlement against an open CashRecord. Mutates collectionAmount, pendingDues, status=SETTLED. Tenant-scoped. requiresApproval=true.",
  inputSchema: { /* zod-mirrored object */
    type: "object" as const,
    properties: {
      cashRecordId: { type: "string" },
      amountKd: { type: "number", description: "Collected in KD, 3-decimals." },
      method: { type: "string", enum: ["CASH", "BANK_TRANSFER", "MOBILE_WALLET"] },
      note: { type: "string" },
    },
    required: ["cashRecordId", "amountKd", "method"],
    additionalProperties: false,
  },
  inputValidator: z.object({
    cashRecordId: z.string().min(1),
    amountKd: z.number().min(0.001),
    method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_WALLET"]),
    note: z.string().max(400).optional(),
  }).strict(),
  strict: true,
  sideEffect: "write",
  requiredRole: ["ADMIN", "ACCOUNTANT"],   // ACCOUNTANT per RBAC table below
  requiresApproval: true,
  allowedAgents: ["monitor", "reconciliation", "chat"],
  editableParams: ["amountKd", "note"],
  async execute(ctx, input) {
    // Reached only AFTER human approval (ctx.userId set).
    return prisma.$transaction(async (tx) => {
      const cash = await tx.cashRecord.findFirst({
        where: { id: input.cashRecordId, tenantId: ctx.tenantId },
      });
      if (!cash) throw new Error("CashRecord not in tenant scope");
      if (cash.status === "SETTLED") throw new Error("Already settled");

      const collected = input.amountKd;
      const updated = await tx.cashRecord.update({
        where: { id: cash.id },
        data: {
          collectionAmount: collected,
          pendingDues: Math.max(0, Number(cash.salesAmount) - collected),
          status: "SETTLED",
          notes: input.note ?? cash.notes,
        },
      });
      await tx.cashTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          driverId: cash.driverId,
          date: new Date(),
          type: "COLLECTION",
          amount: collected,
          description: `Settled by ${ctx.userId} via Workbench`,
          runningBalance: 0, // recomputed by trigger / next reconciliation pass
        },
      });
      return { ok: true, cashRecordId: updated.id, status: updated.status };
    });
  },
});

toolRegistry.register(recordCashSettlement);
```

**Why the transaction matters:** if `cashTransaction.create` fails, the `cashRecord.update` rolls back so the books never show "marked settled but no entry in the ledger." Prisma 5 rolls back automatically on throw inside the `async (tx) => …` form. [CITED: prisma.io/docs — interactive callback form]

### Pattern 2: Move a tool from "Phase 8 disabled" to "live" in the projector

```typescript
// services/decisions/cardProjector.ts (extend Phase 2 file)
// Add the new live set; the existing PHASE_2_LIVE_TOOLS stays for backwards-compat
// but the projector's `toolIsLive` field is computed from the union.
export const PHASE_8_LIVE_TOOLS: ReadonlySet<string> = new Set([
  "draftCourierMessage",        // already in Phase 2 set
  "sendCourierMessage",
  "applyPenalty",
  "suspendDriver",
  "reassignShift",
  "flagForReview",
  "createTrainingTask",
  "recordCashSettlement",
  "escalateToHumanSupervisor",
  "generatePayrollAdjustment",
]);

// In projectPendingAction(...):
//   toolIsLive: PHASE_2_LIVE_TOOLS.has(toolName) || PHASE_8_LIVE_TOOLS.has(toolName),
```

The `/decisions/:id/approve` route already branches on `toolIsLive`; once these tools are in the set, Approve fires the execute body without any further route changes. [VERIFIED: routes/decisions.ts:372 — `const isLive = PHASE_2_LIVE_TOOLS.has(pa.toolName)`]

### Pattern 3: Per-tool rollback dispatcher

```typescript
// services/finance/rollbackDispatcher.ts — NEW
// Replaces the Phase 2 audit.ts inline rollback for draftCourierMessage
// with a per-tool function table. Keeps audit.ts thin.

import type { AgentAction } from "@prisma/client";
import { prisma } from "../../config";

type Reverser = (audit: AgentAction, tenantId: string, userId: string) => Promise<void>;

export const REVERSERS: Record<string, Reverser> = {
  // Reversible tools — these can be undone within the rollback window
  draftCourierMessage: async (a, tenantId) => {
    if (!a.agentRunId) return;
    await prisma.notification.updateMany({
      where: { tenantId, metadata: { path: ["drafterRunId"], equals: a.agentRunId } },
      data: { type: "AGENT_DRAFT_ROLLED_BACK" },
    });
  },
  applyPenalty: async (a, tenantId) => {
    // Soft-rollback: Penalty.penaltyStatus = "OVERTURNED"
    const penaltyId = (a.originalProposal as any).penaltyId
      ?? (a.subjectType === "Penalty" ? a.subjectId : null);
    if (!penaltyId) return;
    await prisma.penalty.updateMany({
      where: { id: penaltyId, tenantId },
      data: { penaltyStatus: "OVERTURNED" },
    });
  },
  suspendDriver: async (a, tenantId) => {
    if (a.subjectType !== "Driver" || !a.subjectId) return;
    await prisma.driver.updateMany({
      where: { id: a.subjectId, tenantId },
      data: { status: "ACTIVE" }, // reverse the SUSPENDED transition
    });
  },
  reassignShift: async (a, tenantId) => {
    const { shiftId, previousDriverId } = a.originalProposal as any;
    if (!shiftId || !previousDriverId) return;
    await prisma.shift.updateMany({
      where: { id: shiftId, tenantId },
      data: { driverId: previousDriverId },
    });
  },
  recordCashSettlement: async () => {
    throw new Error("Cash settlement rollback requires accountant manual reversal");
  },
  generatePayrollAdjustment: async () => {
    throw new Error("Payroll rollback only valid before payroll run is FROZEN");
  },
};
```

### Anti-Patterns to Avoid

- **Hand-rolling the audit row inside the tool body.** Always let the Phase 2 `/decisions/:id/approve` route call `writeAgentAction(...)` after the tool returns. The tool body returns a structured output; the route writes the ledger. Duplicating `writeAgentAction` inside the tool will write two rows.
- **Mutating cash with JS `number`.** The Decimal columns lose precision the moment you `Number(decimal)` and divide. Always feed the Prisma `Decimal` type through the math.
- **Deleting on rollback.** `Penalty.create` rollback is `penaltyStatus = "OVERTURNED"`, not `prisma.penalty.delete`. Preserves the audit trail per CON-audit-row-shape — the founder must always see "Darb proposed X, you approved X, then you rolled it back" rather than X vanishing.
- **Approving without re-checking `resolvedAt: null`.** Always use the Phase 2 optimistic-lock pattern `updateMany({ where: { id, resolvedAt: null } })`. The dual-approval race was already a documented pitfall in Phase 2's T-02-14 test.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic locking on dual approvals | A `version` column on PendingAgentAction | Reuse `updateMany({where:{id, resolvedAt:null}})` with count check | Already proven across 188 backend tests; T-02-14 covers the race. |
| Audit row writer | A new `writeFinanceAction` ledger | Reuse `agent/ledger.ts::writeAgentAction` | CON-audit-row-shape requires one canonical ledger; bifurcating means two training corpuses for the agent. |
| Tenant-scope guard in new finance routes | Manual `where: { tenantId }` checks per route | Rely on `prismaExtensions.ts` runtime guard + `lint:tenant` static rule extended to `services/finance/` | Phase 1 lint rule already catches missing filters. Add the new directory to the `lint:tenant` script glob. |
| Cash math | Floating-point arithmetic on Decimal columns | Prisma `Decimal` arithmetic via `decimal.js` methods | KD = 1000 fils; one rounding error per settlement and the books drift. |
| Bank-file CSV streaming | Concatenating strings in memory | Node `stream.Transform` or `papaparse` with stream API | Payroll runs >300 drivers per fleet; full month export must stream. |
| Reconciliation gap detection | Recomputing on every page load | Materialise into `PendingDuesLedger` (already exists) + memoise via React Query | The model is already there; the engine that fills it just needs the new "expected vs collected delta" column or a derived view. |
| WhatsApp send path | A new outbound provider integration | Re-use `NotificationDelivery` channel=WHATSAPP — Phase 9 ships the actual carrier | Phase 9 (Mobile Agent Inbox + Bilingual Outbound) is the right place. Phase 8 enqueues `sendCourierMessage` rows; Phase 9 ships them. |
| Rollback API | A new endpoint per tool | Reuse `/api/audit/agent-actions/:id/rollback` from Phase 2 with a dispatch table | The endpoint exists; only the per-tool reverser is new. |

**Key insight:** Phase 8 is mostly **wiring**, not new primitives. Every architectural component already exists in the repo. The risk is in the side-effect bodies of the seven new tools, not in the surrounding ledger / lock / projector machinery.

## Common Pitfalls

### Pitfall 1: Dual-approval race on Phase 8 tools
**What goes wrong:** Two accountants click Approve on the same Penalty proposal within ~50ms. Without protection, two `Penalty` rows are created and two `AgentAction` rows are written.
**Why it happens:** The browser's React Query cache shows both clients the same `pending` card; the optimistic-lock claim is the only thing that stops both from firing.
**How to avoid:** Use the proven Phase 2 pattern verbatim:
```ts
const claim = await prisma.pendingAgentAction.updateMany({
  where: { id: pa.id, resolvedAt: null } as any,
  data: { resolvedAt: new Date(), resolution: "approved", resolvedBy: userId },
});
if (claim.count !== 1) return res.status(409).json({ error: "Already resolved" });
```
Then re-invoke the tool inside the now-claimed window. [VERIFIED: routes/decisions.ts:344-356]
**Warning signs:** Two `AgentAction` rows with the same `subjectId` + same `toolName` within 1 second.

### Pitfall 2: Penalty double-apply via the manual penalty route
**What goes wrong:** The accountant approves a penalty via the agent surface AND manually creates one via `POST /api/penalties` for the same violation. The driver gets penalised twice.
**Why it happens:** Two write paths (manual UI + agent), no idempotency key.
**How to avoid:** Either (a) gate the manual `POST /api/penalties` to require a `proposedActionId` reference when the violation already has an `EFFECTIVE` penalty, or (b) add an `@@unique([violationId, penaltyType])` to the Penalty / Violation join table. Recommend option (a) — the agent surface should not block manual entries entirely, just warn.
**Warning signs:** Two `Penalty` rows on the same `violationId` (look at the implicit m2m join).

### Pitfall 3: Cash settlement rollback corrupts the running balance
**What goes wrong:** Rolling back `recordCashSettlement` reverts the CashRecord status but `CashTransaction.runningBalance` keeps the new (now wrong) value, and the next reconciliation pass shows an inconsistent ledger.
**Why it happens:** `runningBalance` is a denormalised column updated downstream.
**How to avoid:** **Disable rollback for `recordCashSettlement`** — the rollback dispatcher returns "requires accountant manual reversal." Cash mutations are accounting-grade and must not be reversed by Darb; the accountant reverses them manually with a counter-transaction. The audit row still shows the action; rollback is just gated.
**Warning signs:** Asking for rollback on a cash row.

### Pitfall 4: Suspending a driver doesn't cascade
**What goes wrong:** `suspendDriver` sets `Driver.status = SUSPENDED` but the driver's active shifts are still BOOKED. Tomorrow they show up in the dispatcher's `/floor` view as expected-online.
**Why it happens:** Status is a leaf field; cascades aren't automatic.
**How to avoid:** Inside the `suspendDriver` execute body, in the same transaction: (a) `Driver.update status = SUSPENDED`, (b) `Shift.updateMany where { driverId, scheduledStart > now, status = BOOKED } → status = CANCELLED`, (c) `DriverRestriction.create` with type=TEMPORARY and the suspension window. The existing `DriverRestriction` model and `assertDriverNotRestricted` helper (already used by `routes/cash.ts`) give us the gate.
**Warning signs:** Suspended driver appearing in `/floor` or `/decisions` proposals after suspension.

### Pitfall 5: Approving an audit-only proposal and surprising the operator
**What goes wrong:** During Phase 2, `proposeCashReminder` was audit-only. After Phase 8 promotes it (or its successor `recordCashSettlement`) to live, an operator looks at a 3-week-old proposal and clicks Approve, expecting the Phase 2 no-op behaviour — and instead the cash row mutates.
**Why it happens:** PendingAgentAction rows aren't expired automatically.
**How to avoid:** Add a Wave 1 migration: any `PendingAgentAction.toolName IN (phase-8 tools) AND resolvedAt IS NULL AND createdAt < phase-8-deployment-date` gets marked `resolution="rejected", overrideReason="Phase 8 cutover — tool semantics changed"`. The Decisions UI already shows resolved cards as historical.
**Warning signs:** First time a Phase 8 tool fires, check the `createdAt` of the source PendingAgentAction.

### Pitfall 6: Tenant guard regression in the new finance routes
**What goes wrong:** The `lint:tenant` rule isn't extended to `services/finance/`, a developer writes `prisma.invoice.findMany({})` without a tenantId, and one fleet sees another fleet's invoices.
**Why it happens:** The Phase 1 lint script has an explicit glob — it does NOT enforce globally (only on the listed directories, per backend/.eslintrc.js + package.json `lint:tenant`).
**How to avoid:** Wave 0 task: extend the `lint:tenant` package.json script to add `src/services/finance/ src/routes/finance*.ts src/agent/tools/action/applyPenalty.ts ...` to the glob. The runtime guard in `prismaExtensions.ts` is a safety net, not a substitute. [VERIFIED: backend/package.json `lint:tenant` script]
**Warning signs:** First multi-tenant test fixture spawns a second tenant's invoices.

## Runtime State Inventory

Phase 8 introduces NEW data and NEW state — it is not a rename/refactor — so this section is mostly N/A. The one exception:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `PendingAgentAction` rows created in Phase 2 with `toolName` in the seven Phase-8-disabled set may still be `resolvedAt=null` at deployment time | Wave 1 migration: mark them rejected with "Phase 8 cutover — tool semantics changed." See Pitfall 5. |
| Live service config | None — Phase 8 ships new tools / routes, no external service config | None |
| OS-registered state | None | None |
| Secrets/env vars | None new | None |
| Build artifacts | None — TS compile only | None |

## Code Examples

### Wave 1 — `applyPenalty` tool body (live)

```typescript
// agent/tools/action/applyPenalty.ts
// Source: monitor.md hints + Penalty model (schema.prisma:Penalty)
export const applyPenalty = defineTool({
  name: "applyPenalty",
  description: "Apply a penalty (warning / training / record / suspension) to a driver, optionally linked to a source violation. Mutates Penalty; for ACCOUNT_SUSPENSION also delegates to suspendDriver inside the same transaction. Tenant-scoped. requiresApproval=true.",
  inputSchema: {
    type: "object" as const,
    properties: {
      driverId: { type: "string" },
      penaltyType: { type: "string", enum: ["ONLINE_TRAINING", "VIOLATION_RECORD", "ACCOUNT_SUSPENSION", "WARNING"] },
      penaltyValue: { type: "string", description: "Training ID / fine amount / suspension days." },
      reason: { type: "string", description: "Operator-facing reason (20-400 chars)." },
      sourceViolationId: { type: "string", description: "Optional Violation.id linking this penalty to its trigger." },
    },
    required: ["driverId", "penaltyType", "reason"],
    additionalProperties: false,
  },
  inputValidator: z.object({
    driverId: z.string().min(1),
    penaltyType: z.enum(["ONLINE_TRAINING", "VIOLATION_RECORD", "ACCOUNT_SUSPENSION", "WARNING"]),
    penaltyValue: z.string().max(120).optional(),
    reason: z.string().min(20).max(400),
    sourceViolationId: z.string().optional(),
  }).strict(),
  strict: true,
  sideEffect: "write",
  requiredRole: ["ADMIN", "OPS_MANAGER", "ACCOUNTANT"],
  requiresApproval: true,
  allowedAgents: ["monitor", "triage", "reconciliation", "chat"],
  editableParams: ["penaltyValue", "reason"],
  async execute(ctx, input) {
    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findFirst({
        where: { id: input.driverId, tenantId: ctx.tenantId },
      });
      if (!driver) throw new Error("Driver not in tenant scope");

      const penalty = await tx.penalty.create({
        data: {
          tenantId: ctx.tenantId,
          driverId: driver.id,
          penaltyType: input.penaltyType,
          penaltyStatus: "EFFECTIVE",
          penaltyValue: input.penaltyValue,
          ...(input.sourceViolationId
            ? { violations: { connect: { id: input.sourceViolationId } } }
            : {}),
        },
      });

      // ACCOUNT_SUSPENSION cascade — delegate to suspendDriver logic inline
      if (input.penaltyType === "ACCOUNT_SUSPENSION") {
        const days = Number.parseInt(input.penaltyValue ?? "7", 10) || 7;
        await tx.driver.update({
          where: { id: driver.id },
          data: { status: "SUSPENDED" },
        });
        await tx.shift.updateMany({
          where: {
            tenantId: ctx.tenantId,
            driverId: driver.id,
            scheduledStart: { gte: new Date() },
            status: "BOOKED",
          },
          data: { status: "CANCELLED" },
        });
        await tx.driverRestriction.create({
          data: {
            tenantId: ctx.tenantId,
            driverId: driver.id,
            type: "TEMPORARY",
            reason: input.reason,
            startDate: new Date(),
            endDate: new Date(Date.now() + days * 86400_000),
          },
        });
      }

      return { ok: true, penaltyId: penalty.id, penaltyType: penalty.penaltyType };
    });
  },
});
```

### Wave 2 — Cash reconciliation gap detection (route)

```typescript
// routes/cash.ts — NEW handler appended
router.get("/reconciliation", rbac("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const tenantId = req.user!.tenantId;
  const platform = String(req.query.platform ?? "").toUpperCase();
  const ageBuckets = [0, 3, 7, 14]; // days

  // Gap = expected (salesAmount) - collected (collectionAmount) when status != SETTLED
  const rows = await prisma.cashRecord.findMany({
    where: {
      tenantId,
      status: { in: ["PENDING", "PARTIAL"] },
      ...(platform ? { driver: { platform } } : {}),
    },
    include: { driver: { select: { id: true, name: true, platform: true, phone: true } } },
    orderBy: { date: "asc" },
  });

  const today = new Date();
  const byBucket = ageBuckets.map((threshold, i) => {
    const nextThreshold = ageBuckets[i + 1] ?? Number.POSITIVE_INFINITY;
    const filtered = rows.filter((r) => {
      const ageDays = Math.floor((today.getTime() - r.date.getTime()) / 86400_000);
      return ageDays >= threshold && ageDays < nextThreshold;
    });
    const totalGap = filtered.reduce(
      (sum, r) => sum + (Number(r.salesAmount) - Number(r.collectionAmount)),
      0,
    );
    return { threshold, totalGap, count: filtered.length };
  });

  res.json({ buckets: byBucket, platform });
});
```

### Wave 4 — `/finance` layout with role gate (Next.js App Router)

```typescript
// frontend/src/app/(dashboard)/finance/layout.tsx
// Source: nextjs.org/docs/app/getting-started/mutating-data
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  // ACCOUNTANT default landing; ADMIN can view too
  if (!["ADMIN", "ACCOUNTANT"].includes(session.user.role)) {
    redirect("/decisions");
  }

  return (
    <div className="flex h-screen">
      <FinanceLeftRail />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

[CITED: nextjs.org/docs/app/getting-started/mutating-data — App Router patterns]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tool execute = side effect + audit row in one function | Tool execute = side effect only; route writes audit row | Phase 2 (2026-05-09) | Phase 8 must follow this split — already enforced by `/decisions/:id/approve`. |
| Rollback via row delete | Rollback via status flip (`OVERTURNED` / `ACTIVE` / `CANCELLED`) | Phase 2 (audit.ts) | Phase 8 reversers all soft-rollback for audit preservation. |
| Phase 2 audit-only stubs return `audit_only: true` | Phase 8 returns real side-effect IDs (`penaltyId`, `cashRecordId`, etc.) | This phase | Operators get real receipts; UI shows the spawned entity in the action card output. |
| Manual `POST /api/penalties` is the only penalty path | Agent-proposed `applyPenalty` + manual UI co-exist | This phase | Manual UI continues to work; agent surface becomes the recommended path. |
| Optimistic locking via `updateMany` count check | Same — proven in Phase 2 | Phase 2 | No change; just expand to seven new tools. |

**Deprecated/outdated:**
- The old `_legacy/` directory under `agent/tools/action/` is pre-Phase-1 artefacts and must NOT be referenced by Phase 8 plans.
- The Phase 2 `proposeCashReminder` execute body returns `{ audit_only: true }` — Phase 8 replaces that with the live `recordCashSettlement`. Keep `proposeCashReminder` for backwards-compat (the monitor's prompt references it) but mark its description as deprecated and point at `recordCashSettlement`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bank file format is KFH/NBK/Boubyan CSV | Standard Stack > Alternatives | Wrong format = accountant rejects export; Wave 3 task needs to confirm with design partner #1 before locking. |
| A2 | Payroll computes weekly, not bi-weekly | Pattern 3 / Architecture | Period length is fleet-specific; expose `payrollCycle` config on Tenant. |
| A3 | `recordCashSettlement` rollback always requires manual reversal | Pitfall 3 / rollbackDispatcher | If founder wants soft-rollback enabled, the dispatcher needs a counter-transaction path. |
| A4 | `papaparse` is the right CSV streamer | Supporting deps | If the team prefers a hand-rolled `Transform`, skip the new dep. |
| A5 | Suspension cascades immediately (no notice window) | Pitfall 4 / applyPenalty | Some Kuwait labour-law rules require notice; confirm with HR module owner. |
| A6 | Workbench sidebar order: Cash → Payroll → Invoices → Expenses → History | Workbench layout | Founder may want a different ordering for accountant muscle memory. |

## Open Questions

1. **Bank file format per Kuwait bank**
   - What we know: KD is 3-decimal, IBAN is `KW` + 28 chars. Most banks accept a CSV with columns `IBAN,Amount,Reference`.
   - What's unclear: Whether design partner #1's fleet has standardised on one bank (KFH / NBK / Boubyan / Burgan) or supports multiple.
   - Recommendation: Ship a generic CSV in Wave 3; iterate with the design partner once the first payroll run is dry.

2. **Payroll deduction granularity**
   - What we know: Violation → Penalty exists; CON-violations and `Penalty.penaltyValue` already model amounts.
   - What's unclear: Whether deductions are applied per-violation (sum at run time) or per-pre-aggregated weekly Penalty.
   - Recommendation: Apply at run time inside `generatePayrollAdjustment` — the tool sums `Penalty` rows in EFFECTIVE state with `createdAt` inside the pay window.

3. **Americana cash exclusion**
   - What we know: CON-cash-platform-coverage explicitly excludes Americana from Cash (no driver cash flow).
   - What's unclear: Whether Americana shows up in Payroll (it should — Americana drivers do get paid) and Invoices (yes — Americana owes the fleet too).
   - Recommendation: Americana excluded from `/finance/cash` only; present in `/finance/payroll` and `/finance/invoices`. Document in the UI.

4. **`sendCourierMessage` channel routing**
   - What we know: Phase 9 ships the carriers (WhatsApp / SMS).
   - What's unclear: Whether Phase 8's `sendCourierMessage` enqueues a `NotificationDelivery` row with `status=QUEUED` and lets the Phase 9 worker drain it, or whether Phase 8 ships an in-app-only path.
   - Recommendation: Enqueue `NotificationDelivery` rows with `channel=WHATSAPP, status=QUEUED` in Phase 8; the worker stays dormant until Phase 9. The audit trail is captured today; carriers go live later.

5. **Rollback window for finance tools**
   - What we know: Phase 2 has a 5-minute undo window (`/decisions/:id/undo`) and an unbounded admin rollback (`/agent-actions/:id/rollback`).
   - What's unclear: Whether finance tools should have a hard cap (e.g., no rollback after the payroll run is FROZEN, no rollback on cash after EOD).
   - Recommendation: Per-tool `rollbackWindow` config on the tool definition; payroll = until-frozen, cash = manual-only, penalty = 30 days, suspend = 7 days, schedule = until-shift-starts.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 15 | All finance models | ✓ | 15.x (Docker Compose) | — |
| Redis 7 | BullMQ + tenant-scope context | ✓ | 7.x | — |
| Node 18+ | TS runtime | ✓ | per package.json | — |
| Anthropic SDK | Tool registry consumer (when monitor proposes) | ✓ | `^0.80.0` | — |
| Prisma 5 | All transactions | ✓ | `^5.22.0` | — |
| Next.js 14 | `/finance/*` segments | ✓ | `14.2.35` | — |
| Recharts | P&L chart | ✓ | `^3.8.1` | — |
| `papaparse` | Bank file export (Wave 3) | ✗ | — | Hand-rolled `Transform` stream |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `papaparse` (alternative: native Node streams).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend) + Vitest (frontend, where applicable) — already pinned by Phases 1-4 |
| Config file | `backend/jest.config.ts` (existing) |
| Quick run command | `cd backend && npm test -- --testPathPatterns=phase8` |
| Full suite command | `cd backend && npm test && cd ../frontend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-agent-action-tools | applyPenalty execute writes Penalty | unit | `npm test -- agent/tools/action/applyPenalty.test.ts` | ❌ Wave 0 |
| REQ-agent-action-tools | suspendDriver cascades shifts + restrictions | integration | `npm test -- agent/tools/action/suspendDriver.test.ts` | ❌ Wave 0 |
| REQ-agent-action-tools | reassignShift updates shift driver atomically | unit | `npm test -- agent/tools/action/reassignShift.test.ts` | ❌ Wave 0 |
| REQ-agent-action-tools | recordCashSettlement updates CashRecord + CashTransaction in one tx | integration | `npm test -- agent/tools/action/recordCashSettlement.test.ts` | ❌ Wave 0 |
| REQ-agent-action-tools | dual-approval race returns 409 for one writer | integration | `npm test -- routes/decisions.dual-approval.test.ts` | ✅ extends Phase 2 T-02-14 |
| REQ-agent-action-tools | rollback dispatcher soft-reverses each tool | integration | `npm test -- services/finance/rollbackDispatcher.test.ts` | ❌ Wave 0 |
| REQ-finance-cash-workbench | /api/cash/reconciliation returns age-bucketed gaps | unit | `npm test -- routes/cash.reconciliation.test.ts` | ❌ Wave 0 |
| REQ-finance-payroll | payrollComputer sums penalty deductions per driver | unit | `npm test -- services/finance/payrollComputer.test.ts` | ❌ Wave 0 |
| REQ-finance-payroll | bank-file export streams >300 rows without OOM | integration | `npm test -- services/finance/bankFileExporter.test.ts` | ❌ Wave 0 |
| REQ-finance-invoices | /api/finance/invoices lists per-platform | unit | `npm test -- routes/financeInvoices.test.ts` | ❌ Wave 0 |
| REQ-finance-expenses-pl | /api/finance/pnl returns month + quarter cuts | unit | `npm test -- routes/financePnl.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPatterns=phase8` (~30s)
- **Per wave merge:** `npm test` (full backend) + `npm test` (frontend) — ~3min
- **Phase gate:** Both suites green before `/gsd-verify-work` plus a manual dual-approval smoke test (two browser tabs, same Penalty, click both Approve).

### Wave 0 Gaps
- [ ] `backend/src/__tests__/agent/tools/action/applyPenalty.test.ts` — covers REQ-agent-action-tools (penalty)
- [ ] `backend/src/__tests__/agent/tools/action/suspendDriver.test.ts` — covers REQ-agent-action-tools (suspend + cascade)
- [ ] `backend/src/__tests__/agent/tools/action/reassignShift.test.ts` — covers REQ-agent-action-tools (shift)
- [ ] `backend/src/__tests__/agent/tools/action/recordCashSettlement.test.ts` — covers REQ-agent-action-tools (cash)
- [ ] `backend/src/__tests__/agent/tools/action/sendCourierMessage.test.ts`
- [ ] `backend/src/__tests__/agent/tools/action/applyPenalty.suspend-cascade.test.ts` — integration
- [ ] `backend/src/__tests__/services/finance/rollbackDispatcher.test.ts`
- [ ] `backend/src/__tests__/services/finance/payrollComputer.test.ts`
- [ ] `backend/src/__tests__/services/finance/reconciliation.test.ts`
- [ ] `backend/src/__tests__/routes/cash.reconciliation.test.ts`
- [ ] `backend/src/__tests__/routes/financePayroll.test.ts`
- [ ] `backend/src/__tests__/routes/financeInvoices.test.ts`
- [ ] `backend/src/__tests__/routes/financeExpenses.test.ts`
- [ ] `backend/src/__tests__/routes/financePnl.test.ts`
- [ ] `frontend/src/__tests__/finance/FinanceLayout.test.tsx` — role gate
- [ ] `frontend/src/__tests__/finance/ReconciliationGrid.test.tsx`
- [ ] Wave 0: extend `lint:tenant` package.json glob to include `src/services/finance/` + `src/routes/finance*.ts` + the eight new tool files

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `authMiddleware` (JWT) on every finance route |
| V3 Session Management | yes | Existing 15-min access + 7-day refresh; no Phase 8 changes |
| V4 Access Control | yes | RBAC table below; `tenantScope` middleware mandatory on every new route |
| V5 Input Validation | yes | Zod strict mode on every tool inputValidator; `editableParams` allow-list on Approve |
| V6 Cryptography | no | No new crypto introduced; bank-file export contains no PII beyond the existing payslip data which is already protected at rest by Postgres + Vercel managed disks |
| V7 Error Handling | yes | All routes catch + return `{ error: msg }`; no stack traces leak |
| V10 Malicious Code | yes | Prompt injection — monitor.md already documents "data not instructions"; same applies to new finance tools |

### Known Threat Patterns for {Express + Prisma + Next.js}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant penalty creation | Information Disclosure / Tampering | `tenantScope` middleware + `prismaExtensions` runtime guard + `lint:tenant` static rule |
| Approver edits a proposal into a different action | Tampering | `editableParams` allow-list per tool; out-of-list keys silently dropped (Phase 2 T-02-10) |
| Concurrent approvals (race) | Tampering / Repudiation | `updateMany({where:{id, resolvedAt:null}})` optimistic claim (Phase 2 T-02-14) |
| Double-applied penalty via manual + agent path | Tampering | Idempotency check on `Penalty.violationId` (see Pitfall 2) |
| Replay of rollback endpoint | Repudiation | `rolledBackAt` non-null check on first call returns 409 |
| Prompt injection via courier name into `applyPenalty` reason | Tampering | All free-text fields are data per monitor.md; tool execute never re-prompts the model |
| Bank file leak | Information Disclosure | Export route requires `rbac("ADMIN", "ACCOUNTANT")`, no public URL, streamed response not stored |

### RBAC table (Phase 8 specific)

| Tool / Surface | ADMIN | OPS_MANAGER | SUPERVISOR | ACCOUNTANT | VIEWER |
|----------------|-------|-------------|------------|------------|--------|
| `recordCashSettlement` | ✓ Approve | — | — | ✓ Approve | — |
| `applyPenalty` | ✓ Approve | ✓ Approve | — | ✓ Approve (cash impact) | — |
| `suspendDriver` | ✓ Approve | ✓ Approve | — | — | — |
| `reassignShift` | ✓ Approve | ✓ Approve | ✓ Approve | — | — |
| `sendCourierMessage` | ✓ Approve | ✓ Approve | ✓ Approve | — | — |
| `createTrainingTask` | ✓ Approve | ✓ Approve | ✓ Approve | — | — |
| `escalateToHumanSupervisor` | ✓ Approve | ✓ Approve | ✓ Approve | ✓ Approve | — |
| `generatePayrollAdjustment` | ✓ Approve | — | — | ✓ Approve | — |
| `/finance/*` UI access | ✓ | (redirected to /decisions) | (redirected) | ✓ (default landing) | (read-only audit only) |
| `/api/audit/agent-actions/:id/rollback` | ✓ | ✓ | — | — | — |
| Read audit log `/api/audit/agent-actions` | ✓ | ✓ | ✓ | ✓ | ✓ |

## Project Constraints (from CLAUDE.md)

Phase 8 must honour these directives from `/Users/mac/Documents/Darb/CLAUDE.md`:

- TypeScript strict mode throughout — every new tool, route, and service file passes `tsc --strict`.
- Prisma for all DB access (never raw SQL unless aggregation requires it) — the P&L aggregator may use `prisma.$queryRaw` for the month/quarter rollup if Prisma's `groupBy` can't express it; otherwise use `groupBy`.
- All routes use `authMiddleware` + `tenantScope` — applies to every new `routes/finance*.ts`.
- Pagination via `getPagination()` + `paginatedResponse()` utils — finance list endpoints use the same helpers as `cash.ts`.
- Error handling: try/catch in every route, return `{ error: message }` — mirror the Phase 2 / cash.ts pattern.
- Frontend: Tailwind utility classes, Shadcn components, Lucide icons.
- Arabic/English bilingual support — `Notification.titleAr` / `bodyAr` columns already exist; `sendCourierMessage` writes both when Phase 9 lands. Phase 8 may write English-only and leave Arabic as `null`.
- Platform-specific code lives under platform-named directories — finance crosses platforms, so it sits under `src/services/finance/`, not under any platform directory.

Plus, from the Darb v2 PRD constraints:

- **CON-action-confirm-card** — every action tool emits a confirm card. Already enforced by `requiresApproval: true` on every tool.
- **CON-audit-row-shape** — `proposer: "Darb"` (hardcoded in ledger.ts), `approverId: req.user!.userId`, `originalProposal` + `modificationsBeforeApproval` (diff), `outcome`, `reasoning`. Already enforced by `writeAgentAction`.
- **CON-cash-platform-coverage** — Cash UI shows Keeta, Talabat, Deliveroo only. Americana excluded by filtering at the route level (`where.driver.platform !== "AMERICANA"` in `/api/cash/reconciliation`).
- **CON-engineer-allocation-assumption** — 1 engineer + Claude Code. Phase 8 is the largest phase by surface area; expect 5-7 waves and sequential execution. Plan a Wave 0 (test scaffolding + lint glob extension) before Wave 1 (the seven tools).

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` — AgentAction, PendingAgentAction, CashRecord, CashTransaction, Driver, Shift, Penalty, Violation, DriverRestriction, Notification models — all read 2026-05-13.
- `backend/src/agent/registry.ts` — `defineTool` helper + RBAC + approval gate + audit trail. Read 2026-05-13.
- `backend/src/agent/ledger.ts` — `writeAgentAction` writer (canonical CON-audit-row-shape). Read 2026-05-13.
- `backend/src/routes/decisions.ts` — `/decisions/:id/approve` route with optimistic-lock pattern + editable-params allow-list. Read 2026-05-13.
- `backend/src/routes/audit.ts` — Phase 2 rollback endpoint for `draftCourierMessage`. Read 2026-05-13.
- `backend/src/routes/cash.ts` — existing cash routes + COD settle pattern. Read 2026-05-13.
- `backend/src/routes/penalties.ts` — existing penalties CRUD. Read 2026-05-13.
- `backend/src/routes/violations.ts` — existing violations engine. Read 2026-05-13.
- `backend/src/agent/tools/action/draftCourierMessage.ts` — canonical live-tool pattern. Read 2026-05-13.
- `backend/src/agent/tools/action/proposeCashReminder.ts` — audit-only stub that Phase 8 supersedes. Read 2026-05-13.
- `backend/src/agent/tools/action/flagForReview.ts` — audit-only review flag. Read 2026-05-13.
- `backend/src/services/decisions/cardProjector.ts` — `PHASE_2_LIVE_TOOLS` and the `toolIsLive` projection. Read 2026-05-13.
- `backend/src/config/prismaExtensions.ts` — tenant-scope runtime guard. Read 2026-05-13.
- `backend/.eslintrc.js` + `backend/package.json::lint:tenant` — static tenant-scope rule. Read 2026-05-13.
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `PRD_Darb_v2.md` — Phase 8 scope + REQ list + constraints. Read 2026-05-13.
- `.planning/phases/02-decisions-surface-propose-and-confirm-design-partner-1/02-VERIFICATION.md` — Phase 2 deferrals to Phase 8. Read 2026-05-13.

### Secondary (MEDIUM confidence)
- [Prisma 5 Transactions documentation](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — interactive transaction patterns + optimistic locking + isolation levels. WebFetch 2026-05-13.
- [Next.js 14 Server Actions / Mutations documentation](https://nextjs.org/docs/app/getting-started/mutating-data) — App Router patterns for invoking backend mutations. WebFetch 2026-05-13.

### Tertiary (LOW confidence)
- Bank file format assumption (KFH/NBK/Boubyan CSV) — needs design-partner-1 confirmation. Marked A1 in Assumptions Log.
- Payroll cycle (weekly vs bi-weekly) — A2 in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already pinned in repo
- Architecture: HIGH — Phase 8 is wiring on top of Phase 2 primitives
- Pitfalls: HIGH — most pitfalls are derived from the existing Phase 2 test surface (T-02-10, T-02-14, T-02-15, T-02-16)
- Tool execute bodies: MEDIUM — the seven new tools need to be designed; the monitor prompt has hints but no contracts
- Accountant UX specifics: LOW — Recharts P&L chart shape and bank-file format need founder input

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days — stack is stable; Prisma 5 and Next.js 14 are LTS)
