# Requirements: Darb (v2 pivot)

**Defined:** 2026-05-09
**Core Value:** Replace the fleet owner's WhatsApp + Excel chaos with an AI that runs their fleet's performance for them, in 20 minutes a day — by proposing actions a human approves with one click, never firing actions on its own in v1.
**Source:** `.planning/intel/requirements.md` (synthesized from `PRD_Darb_v2.md`, Draft v0.1)
**Status note:** All v1 entries are PROPOSED, inheriting the source PRD's draft status. They become LOCKED once the founder week-1 yes/no gates clear (see PROJECT.md → Open Questions).

**Count reconciliation:** `intel/SYNTHESIS.md` summary stated "33 requirements" but the authoritative enumeration in `intel/requirements.md` contains **42** distinct REQ-IDs. This file follows the authoritative enumeration (42/42 mapped to phases).

## v1 Requirements

The Darb v2 pivot is the FIRST milestone in `.planning/`. All 42 requirements below are v1 scope. Each maps to exactly one roadmap phase (see Traceability section).

### Decisions (owner inbox)

- [ ] **REQ-decisions-proposal-inbox**: Default landing for owner role. Single screen, no clutter. Stack of agent-generated proposal cards. Each card: coloured tag (Suspend / Cash reminder / Promote / Warn), driver name + headline, two-line agent reasoning, three buttons — Approve, Modify, Dismiss. Approve fires the proposed action; Modify opens an editor on the draft; Dismiss closes AND trains the agent. No KPI strip and no leaderboard on this screen — numbers live in Chat. Replaces `/overview`, `/v2`, `/insights`, `/kpis`, `/analytics`, `/tickets`.

### Floor (live map)

- [ ] **REQ-floor-live-map**: Default landing for dispatcher role. Live map of Kuwait, all platforms, real-time. Every online driver = a coloured dot (green=working, grey=idle, red=GPS-stale, blue=scheduled-not-online). Each dot tagged with platform colour. Three pill counters at top: Scheduled-not-online, GPS-stale (>10 min), Order-rejection ×3+ — each clickable, filters the map. Click a dot → right panel slides out with driver details (phone, vehicle, current order, last GPS, today's stats). One action per driver: "Ping (WhatsApp)" — agent drafts message, dispatcher one-clicks send.

### Chat (Ask Darb / generative UI)

- [ ] **REQ-chat-global-access**: Single chat-style surface accessible from everywhere via ⌘K and pinned in the sidebar. Per-user, searchable conversation history; yesterday's answer is one click away.
- [ ] **REQ-chat-generated-dashboards**: Any analytical question produces an inline generated mini-dashboard rather than navigating to a static page. Worked example: "Why did revenue drop yesterday in Hawally?" returns a 3-tile KPI strip, a Tue-vs-Wed bar chart by hour, an amber callout naming the two no-show drivers, and three action buttons: Draft warnings, Reassign tomorrow, Pin to home. Agent picks format (table / time series / mini-map / comparison cards / KPI tiles / action card / draft message). Every generated view has a "Pin to Home" button; pinned views become tiles on Home. Every analytical answer ends in actions, not just numbers.
- [ ] **REQ-chat-action-proposals**: Chat can propose actions, not just answer questions. Worked example: "Apply a 10 KD penalty to drivers who missed shift today" — agent shows the list, the proposed payroll deduction, the WhatsApp draft, and waits for confirm. All proposed actions go through propose-and-confirm.
- [ ] **REQ-chat-scheduled-jobs**: Chat can run scheduled jobs — pinned briefings ("every morning at 6, summarise yesterday and surface today's top 3 risks") and standing rules ("if a courier is GPS-stale > 15 min during a shift, draft a ping" — autonomy is v3).

### Operations (per-platform)

- [ ] **REQ-operations-per-platform-sections**: Each platform (Keeta, Talabat, Deliveroo, Americana) has three sub-pages: Drivers, Orders, Violations. Drivers sub-page = sortable list with score, status, today's orders, last seen → click row opens Driver File. Orders sub-page = today's orders with status, courier, customer area. Violations sub-page = filterable list; engine flags new ones automatically; surface mirrors what's in Decisions. NO per-platform attendance, shifts, performance, or vehicle pages — they collapse into Driver File or Chat.

### Driver File (canonical per-driver page)

- [ ] **REQ-driver-file**: One canonical page per driver, reachable by clicking any driver name anywhere in the app. Source of truth before any owner approves a fire/promote action. Sections: Profile (name, photo, vehicle, platform, contract terms); Live status and today's orders; Performance score with trend over 90 days; Violations history; Cash history (settlements + outstanding); Attendance and shifts; Agent's running notes (auto-generated observations); Decision audit log (every agent proposal touching this driver — approved, modified, dismissed).

### Finance

- [ ] **REQ-finance-cash-workbench**: Driver receivables across platforms. Default landing for accountant role. Covers Keeta, Talabat, Deliveroo only — Americana excluded (no driver cash). Reconciliation, age buckets, agent-drafted reminder messages.
- [ ] **REQ-finance-payroll**: Driver payouts. Computes weekly pay. Applies deductions for violations. Generates payslips. Exports to bank file.
- [ ] **REQ-finance-invoices**: Incoming invoices from platforms — what Keeta/Talabat/Deliveroo/Americana owe the fleet for completed deliveries. Covers all four platforms.
- [ ] **REQ-finance-expenses-pl**: Expenses & P&L view. Tracks vehicle maintenance, fuel, rent, office staff salaries, utilities. Full P&L view with month/quarter cuts.

### HR

- [ ] **REQ-hr-employees**: Office staff records (supervisors, accountants, dispatchers). Stores contracts, salaries, civil ID, contacts. Office staff only — drivers tracked separately in Operations (see DEC-driver-vs-employee-split).
- [ ] **REQ-hr-leave**: Leave management. Annual leave, sick days, public holidays. Office staff only.
- [ ] **REQ-hr-documents**: Document tracking with expiry alerts. Tracks visa, civil ID, contract expiry. Surfaces expiry alerts (critical for Kuwait labour law).

### Agent capabilities

- [ ] **REQ-agent-continuous-monitoring**: Every minute, scan for anomalies — courier offline during shift, GPS-stale, rejection spikes, cash overdue, performance regression. Surface as inbox items in Decisions.
- [ ] **REQ-agent-scoring**: Maintain a live composite score per courier. Already partially done in `aiScoringService`. Agent must explain the score in plain English when asked.
- [ ] **REQ-agent-natural-language-qa**: Natural-language questions over fleet data → generated tables/charts via tools, all tenant-scoped.
- [ ] **REQ-agent-action-drafting**: Translate a goal ("warn the worst 3 today") into a concrete action plan with WhatsApp drafts, penalty entries, audit reasons. Wait for confirm before firing.
- [ ] **REQ-agent-scheduled-briefings**: Daily/weekly digests for owner, accountant, dispatcher. Bilingual where the brief touches couriers (Arabic outbound).
- [ ] **REQ-agent-long-term-memory**: Per-tenant memory of decisions, owner preferences, courier history. Agent gets smarter at the *specific* fleet's patterns over time. Backed by the `AgentMemory` model.
- [ ] **REQ-agent-propose-confirm**: All action tools require a confirm card before firing. v1 has no auto-execute. Non-negotiable. Every action tool produces a confirm card; no write-actions to the world without explicit human click. Every fired action recorded in `AgentAction` with proposer = Darb, approver = the human, original proposal, modifications before approval, outcome, and reasoning.
- [ ] **REQ-agent-trust-graduation**: Autonomy tiers earned over time per action class. v1 (months 0–6): all actions propose-and-confirm. v2 (months 6–12): three low-risk action classes auto-execute with rate limits and per-tenant caps — draft+send routine pings, schedule reminders, GPS-stale notifications to dispatcher. Money-touching and HR-touching actions stay propose-and-confirm. v3 (year 2+): owner-authored standing rules (`AgentRule`) authorised once, agent runs forever with weekly digest.

### Agent tool surface — read tools

- [ ] **REQ-agent-read-tools**: Canonical read-tool surface for the agent. Tenant-scoped. Migrated from existing `aiChiefOfStaffService`. These tools must exist: `revenueByDay`, `revenueByPlatform`, `revenueByZone`, `courierLeaderboard(metric, order, limit, period)`, `courierProfile(driverId)`, `violationsList(filters)`, `cashOutstanding(filters)`, `attendanceForPeriod(filters)`, `liveFleetStatus()`, `gpsTrack(driverId, period)`, `searchOrders(filters)`, `forecastDemand(zone, hourBucket)`, `forecastSupplyGap(zone, hourBucket)`. (The two forecast tools are scoped to land in Phase 11 / Phase 12; the rest in Phase 1.)

### Agent tool surface — action tools (the moat)

- [ ] **REQ-agent-action-tools**: Action-tool surface. Every tool requires a confirm card before firing. These tools must exist: `draftCourierMessage(driverId, intent, language)`, `sendCourierMessage(messageId)`, `applyPenalty(driverId, type, amount, reason, sourceViolationId?)`, `suspendDriver(driverId, durationDays, reason)`, `reassignShift(shiftId, newDriverId, reason)`, `flagForReview(driverId, reason)`, `createTrainingTask(driverId, trainingType)`, `recordCashSettlement(driverId, amount, method, note)`, `escalateToHumanSupervisor(driverId, reason)`, `generatePayrollAdjustment(driverId, period, items[])`. Audit: every action recorded in `AgentAction` with proposer (always Darb), approver (the human), original proposal, modifications before approval, outcome, reasoning.

### Data architecture additions

- [ ] **REQ-data-agent-action**: Add `AgentAction` Prisma model — every proposal/approval/outcome (acts as both audit log and training data). Fields per CON-audit-row-shape.
- [ ] **REQ-data-agent-memory**: Add `AgentMemory` Prisma model — per-tenant key/value notes the agent maintains (e.g., "owner prefers Friday warnings over Thursday").
- [ ] **REQ-data-pinned-view**: Add `PinnedView` Prisma model — saved generated views per user. The dynamic dashboard equivalent.
- [ ] **REQ-data-performance-snapshot**: Add `PerformanceSnapshot` Prisma model — daily snapshot per driver for trend analysis. Fixes the current pattern of recomputing on every read.
- [ ] **REQ-data-agent-rule**: Add `AgentRule` Prisma model — standing rules ("if X then propose Y") for v3 autonomy.
- [ ] **REQ-data-metric-event**: Add `MetricEvent` table for lightweight in-product analytics. Required for the agent to "see itself" and learn what users actually do.

### Mobile (strategic asset)

- [ ] **REQ-mobile-always-on-gps**: Continuous background GPS while logged in. Battery and permission UX done well. Ship in Q1. GPS streams while the courier is logged into the Darb mobile app, regardless of which delivery app is foregrounded.
- [ ] **REQ-mobile-active-platform-detection**: Detect which delivery app is foregrounded (Keeta / Talabat / Deliveroo / Americana) so we get per-platform attribution without scraping.
- [ ] **REQ-mobile-delivery-photo-capture**: Photo capture for delivery proof. Already partly there in the existing app.
- [ ] **REQ-mobile-agent-inbox**: WhatsApp-style inbox to receive agent-drafted messages directly without leaving the app. Ship in Q2.

### Data ingest

- [x] **REQ-ingest-adapter-layer**: Treat scrapers of Keeta/Talabat partner portals as a swappable adapter layer. Scrapers can be replaced without affecting the rest of the system. Wherever an own-app data source exists (mobile GPS, courier check-ins) it is preferred over scraped data. XLSX-import remains a permanent fallback for any platform that breaks scraping. The Keeta `POST /import` route is the canonical pattern.
- [ ] **REQ-ingest-partner-api-conversations**: Begin formal partner-API conversations with Talabat and Keeta in Q3, once 5+ paying fleets exist.

### Realtime infrastructure

- [ ] **REQ-realtime-streaming**: Keep SSE for notifications; add WebSocket for agent streaming (chat tokens) and live floor map subscriptions.

### Pricing & GTM

- [ ] **REQ-pricing-model**: KD 2 per active courier per month, KD 200 minimum. Worked example: a 150-courier fleet bills at KD 300/month. Pricing aligns to value (more couriers = more leverage from the agent). Design partner #1 may pay KD 100/month as a co-design discount.
- [ ] **REQ-gtm-onboarding**: White-glove in-person onboarding. Ingest customer's last 30 days of data. Generate a "Darb's read on your fleet" report and present it as the close. 14-day free trial with 1 hour of founder onboarding. No self-serve in v1 (per DEC-non-goals-12-months until 10 customers).

### Non-functional / scope guardrails

- [ ] **REQ-bilingual-courier-comms**: All outbound courier comms drafted bilingual. WhatsApp / SMS messages from the agent drafted in both English and Arabic. Owner-facing UI remains English-first; full RTL UI is deferred to Y2. Timing depends on PRD section 13 question 5 (founder Arabic capacity); roadmap default places this in Q2.
- [ ] **REQ-tenant-scoped-everything**: Every read tool, every action tool, every memory entry, every pinned view, every metric event must be tenant-scoped (preserving existing tenantScope middleware pattern from the legacy stack).

## v2 Requirements

(Deferred items beyond the v2-pivot milestone — surface here as they emerge during execution. Currently empty.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drivers as a payment platform | Banking/regulatory cost not justified at this stage (PRD §2, §12) |
| Courier-facing super-app | Courier mobile app is a GPS beacon + agent inbox, not a marketplace |
| Direct integration with end-customer-facing apps | Partner platforms own that surface |
| Second mobile app for the owner | Web suffices; chat is desktop-primary |
| Direct payment processing | Out of scope; integrates with existing accounting only |
| Customer-facing features | Darb serves the fleet, not end customers |
| Courier marketplace | Competing with platforms breaks our cross-platform position |
| Replacements for partner platform consoles for non-fleet ops | We run the fleet, not the platform |
| Voice interface to the agent | Phase 2; chat-first |
| Mobile-first chat | Chat is desktop-primary; mobile is GPS + inbox |
| Self-serve signup | Founder-led only until 10 customers |
| Full RTL UI | Deferred to Y2; English-first owner UI; bilingual outbound only in v1 |

## Traceability

Phase mappings for v1 requirements. Each REQ maps to exactly one phase. Status starts at "Pending" and is updated by the execute/transition workflows.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-data-agent-action | Phase 1 | Pending |
| REQ-data-agent-memory | Phase 1 | Pending |
| REQ-data-pinned-view | Phase 1 | Pending |
| REQ-data-performance-snapshot | Phase 1 | Pending |
| REQ-data-metric-event | Phase 1 | Pending |
| REQ-agent-read-tools | Phase 1 | Pending |
| REQ-tenant-scoped-everything | Phase 1 | Pending |
| REQ-decisions-proposal-inbox | Phase 2 | Pending |
| REQ-agent-continuous-monitoring | Phase 2 | Pending |
| REQ-agent-action-drafting | Phase 2 | Pending |
| REQ-agent-propose-confirm | Phase 2 | Pending |
| REQ-pricing-model | Phase 2 | Pending |
| REQ-gtm-onboarding | Phase 2 | Pending |
| REQ-driver-file | Phase 3 | Pending |
| REQ-agent-scoring | Phase 3 | Pending |
| REQ-chat-global-access | Phase 4 | Pending |
| REQ-chat-generated-dashboards | Phase 4 | Pending |
| REQ-chat-action-proposals | Phase 4 | Pending |
| REQ-chat-scheduled-jobs | Phase 4 | Pending |
| REQ-agent-natural-language-qa | Phase 4 | Pending |
| REQ-realtime-streaming | Phase 4 | Pending |
| REQ-mobile-always-on-gps | Phase 5 | Pending |
| REQ-mobile-active-platform-detection | Phase 5 | Pending |
| REQ-mobile-delivery-photo-capture | Phase 5 | Pending |
| REQ-ingest-adapter-layer | Phase 6 | Complete |
| REQ-floor-live-map | Phase 7 | In Progress (Wave 0 RED tests landed; Waves 1-4 turn them GREEN) |
| REQ-finance-cash-workbench | Phase 8 | Pending |
| REQ-finance-payroll | Phase 8 | Pending |
| REQ-finance-invoices | Phase 8 | Pending |
| REQ-finance-expenses-pl | Phase 8 | Pending |
| REQ-agent-action-tools | Phase 8 | Pending |
| REQ-mobile-agent-inbox | Phase 9 | Pending |
| REQ-bilingual-courier-comms | Phase 9 | Pending |
| REQ-operations-per-platform-sections | Phase 10 | Pending |
| REQ-hr-employees | Phase 10 | Pending |
| REQ-hr-leave | Phase 10 | Pending |
| REQ-hr-documents | Phase 10 | Pending |
| REQ-agent-scheduled-briefings | Phase 11 | Pending |
| REQ-agent-trust-graduation | Phase 11 | Pending |
| REQ-agent-long-term-memory | Phase 11 | Pending |
| REQ-ingest-partner-api-conversations | Phase 11 | Pending |
| REQ-data-agent-rule | Phase 12 | Pending |

**Coverage:**
- v1 requirements: **42 total** (per `intel/requirements.md` enumeration)
- Mapped to phases: **42**
- Unmapped: **0** ✓

Per-phase distribution: Phase 1 = 7, Phase 2 = 6, Phase 3 = 2, Phase 4 = 6, Phase 5 = 3, Phase 6 = 1, Phase 7 = 1, Phase 8 = 5, Phase 9 = 2, Phase 10 = 4, Phase 11 = 4, Phase 12 = 1. Total = 42.

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after `/gsd-new-project` ingest synthesis (PRD_Darb_v2.md, Draft v0.1).*
