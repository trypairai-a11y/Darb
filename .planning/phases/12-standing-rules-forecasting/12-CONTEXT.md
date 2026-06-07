# Phase 12 — User Context & Decisions

**Phase:** 12 — Owner-Authored Standing Rules + Forecasting
**Created:** 2026-05-13
**Source:** Founder-authoritative autonomous decisions (resolved against `12-RESEARCH.md` Open Questions Q1–Q6).

## Purpose

This document anchors the six D-XX decisions that `12-02-PLAN.md` (and the Wave 1 catalog, Wave 3 closeout) cite as `D-01..D-06`. The plan-checker (Path B) flagged that the decisions were referenced but not anchored in `CONTEXT.md`. This file is that anchor — every decision below is **LOCKED** and non-negotiable for the executor.

These decisions were derived from `12-RESEARCH.md`'s Open Questions section recommendations and ratified by the founder on 2026-05-13. Each cites the originating research question for traceability.

## Decisions

### D-01 — Rule-fired proposals show source attribution in `/decisions`

**Source:** Open Question Q1.
**Status:** LOCKED.
**Statement:** Proposal cards in `/decisions` whose `PendingAgentAction.source === "rule"` MUST render a footer "via rule: <name>" that links to `/rules/[standingRuleId]`. Cards from monitor agent (source="monitor") or chat (source="chat") do NOT show this footer.
**Rationale:** Owner needs to know which authored rule fired a given proposal so they can decide whether to disable the rule on dismiss. Subtle footer (not a banner) keeps the existing card layout intact.
**Implementation:** `frontend/src/components/decisions/ProposalCardRuleFooter.tsx` rendered conditionally inside `/decisions/page.tsx`. Backend `/api/decisions` list endpoint joins `StandingRule` to surface `standingRuleName`.

### D-02 — Morning briefing emits forecast paragraph only when anomaly threshold crossed

**Source:** Open Question Q2.
**Status:** LOCKED.
**Statement:** The Phase 11 morning briefing narrator MUST only include a forecast paragraph when `|forecast - 4wk_avg| > 15%` for at least one zone-hour bucket. If every bucket is within ±15% of the four-week average, the briefing emits no forecast section at all.
**Rationale:** A flat "demand will be 600 orders today, normal" paragraph adds words without insight. Silence is better than noise. Anomaly-only forecasting surfaces actionable information.
**Implementation:** `backend/src/services/briefings/narrator.ts` gates `forecastDemand` invocation on the anomaly check; `backend/src/agent/prompts/briefing-owner.md` adds an explicit "## Forecast injection rule" section instructing the LLM to mention forecasts only when the guard returns at least one anomaly.

### D-03 — Cash flow projection is a SHARED component rendered on both `/forecast` and `/finance/expenses-pl`

**Source:** Open Question Q3.
**Status:** LOCKED.
**Statement:** The `<CashFlowProjection />` React component MUST be implemented once in `frontend/src/app/(dashboard)/forecast/CashFlowProjection.tsx` and imported by both:
  1. The third tab of `/forecast` (alongside Demand and Supply), and
  2. A new "Projection" section appended below the existing historical P&L table on `/finance/expenses-pl`.
**Rationale:** Accountants live on `/finance/expenses-pl`; ops leads visit `/forecast`. Both audiences need the projection. Single component, two consumers — no duplication, single source of truth.
**Implementation:** Component accepts a `mode: "forecast-tab" | "finance-section"` prop that toggles layout density (full chart vs compact KPI row). `/finance/expenses-pl/page.tsx` import + render in Wave 2 Task 2 (gated on Phase 8 closure — see `<dependency_banner>` in 12-02-PLAN.md).

### D-04 — Rule builder ships single-event conditions only; AND/OR composition deferred to Phase 12.1

**Source:** Open Question Q5.
**Status:** LOCKED.
**Statement:** Wave 2's rule builder UI MUST support exactly one event + threshold per rule (e.g., `condition.event="attendance_late"` with `threshold.minCount=3`). Compound conditions (`{ all: [...] }`, `{ any: [...] }`) are explicitly OUT OF SCOPE for Phase 12.
**Rationale:** YAGNI — no real customer has asked for compound conditions. Pattern 1's discriminated union remains single-event. If a customer asks during DP2 onboarding, Phase 12.1 adds the wrappers. v1 ships the simpler design first.
**Implementation:** `RuleBuilder.tsx` Visual tab exposes one event dropdown + threshold inputs; JSON tab validates against the single-event Zod schema; backend `StandingRuleCondition` discriminated union in `services/standingRules/types.ts` lists all 10 events but no `all/any` wrappers.

### D-05 — Rule export/import via JSON for DP2 seeding

**Source:** Open Question Q6.
**Status:** LOCKED.
**Statement:** Wave 2 MUST ship JSON export (copy-to-clipboard + download .json) and JSON import (paste-to-instantiate) for individual standing rules. Tenant-specific fields (`id`, `tenantId`, `createdAt`, `updatedAt`, `lastFiredAt`, `fireCount`) are stripped on export so the JSON is re-instantiable in a different tenant. Wave 3 DP2 onboarding uses this mechanic to seed the founder-authored rule library.
**Rationale:** Founder needs to migrate good rules from DP1's tenant to DP2's tenant without writing them by hand. Export/import is the simplest mechanic — no cross-tenant template registry needed.
**Implementation:** `frontend/src/components/rules/RuleExportImport.tsx` Dialog. Wave 3 seeds via `.planning/phases/12-standing-rules-forecasting/dp2-rule-templates.json` consumed by `backend/prisma/seed-design-partner-2-fixture.ts` and the onboarding wizard.

### D-06 — DP2 trust level defaults to 0 (propose-and-confirm only)

**Source:** PROJECT.md `DEC-trust-graduated-autonomy` + Open Question Q4 (DP2 readiness).
**Status:** LOCKED.
**Statement:** DP2 onboarding seeds the tenant with trust level 0 — every rule firing routes through `PendingAgentAction` and the existing propose-and-confirm gate. Phase 11's trust-graduation hooks remain owned by Phase 11; Phase 12 does not change auto-execute eligibility.
**Rationale:** Trust must be earned per customer. DP1 may have graduated certain action classes; DP2 starts fresh at trust 0 regardless of what DP1 reached. This is the safest default for second-customer onboarding.
**Implementation:** Wave 3 seed fixture sets the new tenant's `trustLevel` row (Phase 11 schema) to 0. No frontend or backend code change in Phase 12; the default is what Phase 11's `trustGraduation` service writes when no override exists.

## Deferred Ideas

Items deliberately excluded from Phase 12 scope:

- **AND/OR composition of rule conditions** — see D-04. Track for Phase 12.1 if DP2 asks.
- **Anthropic NL → JSON-rule extraction** — RESEARCH lists as OPTIONAL polish; not in any plan. Phase 12.1 if owner explicitly requests.
- **Per-platform forecastDemand filter** — `/forecast` Wave 2 ships zone-only filter. Per-platform breakdown deferred to Phase 12.1 (requires adding a `platform` arg to `forecastDemand` and corresponding aggregation).
- **Auto-fire of rule actions** — Wave 1 hard-codes `propose-and-confirm` for every firing. Phase 11's trust-graduation hooks decide auto-execute independently.

## Claude's Discretion

The following areas are NOT locked by the founder and Claude may choose reasonable defaults:

- Exact wording inside `briefing-owner.md` for the anomaly-only forecast rule (must encode the 15% threshold from D-02 but the surrounding instruction prose is Claude's call).
- Visual styling of the "via rule: …" footer (existing sand-palette typography conventions apply per CLAUDE.md).
- Rule throttle default values inside `catalog.ts` and `dp2-rule-templates.json` (sane defaults: `perSubject: { window: "1d", max: 1 }`, `perTenant: { window: "1d", max: 5 }`).
- Cron worker minute stagger algorithm (RESEARCH suggests `hash(tenantId) % 5`; Claude may swap to deterministic ordering if preferable).

## Audit Trail

| Decision | Question | Locked At | Locked By |
|----------|----------|-----------|-----------|
| D-01 | Open Q1 | 2026-05-13 | Founder (autonomous mode, ratified during plan-check Path B) |
| D-02 | Open Q2 | 2026-05-13 | Founder |
| D-03 | Open Q3 | 2026-05-13 | Founder |
| D-04 | Open Q5 | 2026-05-13 | Founder |
| D-05 | Open Q6 | 2026-05-13 | Founder |
| D-06 | DEC-trust-graduated-autonomy / Open Q4 | 2026-05-13 | Founder |
