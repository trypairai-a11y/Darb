# Roadmap: Darb v2 pivot

## Milestones

- 🚧 **v2 pivot — AI ops chief** - Phases 1-12 (in progress)

## Overview

Twelve sequential phases that take Darb from a multi-platform fleet dashboard to the AI ops chief for delivery fleet owners in the Gulf. Q1 (Phases 1-6) lays the agent spine, the owner's Decisions surface, the canonical Driver File, the chat / generative-UI surface, the mobile GPS beacon, and the ingest adapter layer — exiting when design partner #1's owner says "I check Darb before WhatsApp every morning." Q2 (Phases 7-10) adds the dispatcher's Live Floor, the accountant's Finance workbench with the high-value action tools, mobile bilingual outbound + agent inbox, and the per-platform Operations + HR pages while hiding ~50 legacy pages behind a feature flag — exiting at 3 paying fleets. Q3 (Phase 11) graduates the agent to v2 autonomy with three auto-execute action classes, scheduled briefings, mature long-term memory, and partner-API outreach — exiting at 6 paying fleets. Q4 (Phase 12) ships owner-authored standing rules and forecasting — exiting at 10 paying fleets ready for KSA expansion.

Twelve phases is at the high end of the standard granularity band (5-8) because the v2 pivot is a fast-follow with sequential, time-boxed quarterly exit criteria; aggressive phasing reflects the actual `1 engineer + Claude Code, ~6 months effective` constraint (CON-engineer-allocation-assumption). Each phase is sized so it can be delivered as a coherent capability, not a horizontal layer.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work for the v2 pivot.
- Decimal phases (e.g., 2.1, 2.2): Reserved for urgent insertions during execution.

Decimal phases appear between their surrounding integers in numeric order.

### Q1 — Wedge (May–Jul 2026)

- [x] **Phase 1: Backend Agent Spine + Data Architecture** ✓ — Promoted `aiChiefOfStaffService` into a dedicated `agent/` module with tool registry, action ledger, memory store, and the 11 Phase-1 read tools, all tenant-scoped; added the five new Prisma models (AgentAction, AgentMemory, PinnedView, PerformanceSnapshot, MetricEvent). **Completed 2026-05-09** — 142/142 tests green; 5 plans across 5 sequential waves; see `phases/01-backend-agent-spine-data-architecture/01-VERIFICATION.md`.
- [x] **Phase 2: Decisions Surface + Propose-and-Confirm + Design Partner #1** ✓ — Shipped owner proposal inbox at `/decisions`, propose-and-confirm v1 autonomy model with optimistic-lock race protection, tiered monitor cron (1m/15m/1h), action drafting (draftCourierMessage live; flagForReview + proposeCashReminder audit-only), billing service with KD 2/active courier + KD 200 floor + design-partner override, white-glove onboarding wizard + 30-day backwash worker scaffolding + "Darb's read on your fleet" report. **Completed 2026-05-09** — 188/188 backend tests + 6/6 Phase 2 frontend tests green; 6 plans across 6 sequential waves; additive 4-column migration applied; see `phases/02-decisions-surface-propose-and-confirm-design-partner-1/02-VERIFICATION.md`. Manual: 8-step design-partner-1 dry-run remains for user post-deploy.
- [ ] **Phase 3: Driver File** - Ship the canonical per-driver page reachable from any driver name in the app, with all eight required sections including 90-day performance trend backed by `PerformanceSnapshot` and the agent's plain-English score explanation.
- [ ] **Phase 4: Chat / Generative UI + WebSocket** - Ship the global ⌘K chat, generated mini-dashboards, action-proposal chat flow, scheduled jobs (pinned briefings + standing-rule templates), per-user searchable history, "Pin to Home" mechanic, and add WebSocket alongside existing SSE.
- [ ] **Phase 5: Mobile GPS Beacon** - Ship Expo always-on background GPS with deliberate battery/permission UX, active-platform detection, and delivery photo capture — the cross-platform GPS data moat goes live.
- [ ] **Phase 6: Ingest Adapter Layer** - Refactor existing Keeta/Talabat scrapers behind a swappable adapter interface; ensure XLSX-import fallback exists for every platform; prefer mobile-app data sources over scraped data wherever both exist.

### Q2 — Watchtower & Cash (Aug–Oct 2026)

- [ ] **Phase 7: Live Floor (Map + Pills + Courier Panel)** - Ship the dispatcher's live map of Kuwait at `/floor`, the three pill counters (scheduled-not-online, GPS-stale >10 min, order-rejection ×3+), platform-coloured driver dots, the right-slide courier panel, and the "Ping (WhatsApp)" one-click action.
- [ ] **Phase 8: Finance Workbench + Action Tool Surface (the moat)** - Ship Cash (3 platforms), Payroll, Invoices (4 platforms), Expenses & P&L for the accountant, plus the full 10-tool action surface (draftCourierMessage, sendCourierMessage, applyPenalty, suspendDriver, reassignShift, flagForReview, createTrainingTask, recordCashSettlement, escalateToHumanSupervisor, generatePayrollAdjustment) — every tool wired through propose-and-confirm with full `AgentAction` audit rows.
- [ ] **Phase 9: Mobile Agent Inbox + Bilingual Outbound** - Ship the WhatsApp-style courier inbox in the Expo app and the bilingual (English + Arabic) outbound message drafting for all courier-facing comms.
- [ ] **Phase 10: Operations Per-Platform + HR + Hide-Behind-Flag** - Ship the per-platform Operations sections (Drivers / Orders / Violations sub-pages for Keeta, Talabat, Deliveroo, Americana), the HR module (Employees, Leave, Documents with expiry alerts), and gate ~50 legacy pages (`/v2`, `/overview`, `/insights`, `/analytics`, `/kpis`, `/tickets`, most platform-specific deep pages) behind a feature flag.

### Q3 — Trust & Autonomy v2 (Nov 2026–Jan 2027)

- [ ] **Phase 11: Scheduled Briefings + Trust Graduation v2 + Mature Memory + Partner-API Outreach** - Ship daily/weekly bilingual briefings for owner/accountant/dispatcher, enable the three v2 auto-execute action classes (routine pings, scheduled reminders, GPS-stale notifications) with rate limits + per-tenant caps, mature `AgentMemory` so the agent learns each tenant's preferences, and open formal partner-API conversations with Keeta + Talabat.

### Q4 — Standing Rules & GCC Prep (Feb–Apr 2027)

- [ ] **Phase 12: Owner-Authored Standing Rules + Forecasting** - Ship the `AgentRule` model and the standing-rules authoring UI ("auto-warn 3-strike absentees"), wire `forecastDemand` and `forecastSupplyGap` into the agent tool surface, and finalise the v3 autonomy model with weekly digest of what the agent did.

## Phase Details

### Phase 1: Backend Agent Spine + Data Architecture
**Goal**: Foundation phase. Promote `aiChiefOfStaffService` into a dedicated `backend/src/agent/` module with the tool registry, the action ledger, the memory store, and the read tools that downstream surfaces (Decisions, Driver File, Chat) consume. Land the five new Prisma models the rest of the roadmap depends on. Enforce tenant-scoping on every new surface from day one.
**Depends on**: Nothing (first phase). Inherits the existing backend stack (Express 4 + Prisma 5 + PostgreSQL 15 + Redis 7 + BullMQ + JWT/RBAC/tenantScope middleware).
**Requirements**: REQ-data-agent-action, REQ-data-agent-memory, REQ-data-pinned-view, REQ-data-performance-snapshot, REQ-data-metric-event, REQ-agent-read-tools, REQ-tenant-scoped-everything
**Success Criteria** (what must be TRUE):
  1. A new `backend/src/agent/` module exists with a tool registry that enumerates the read tools and (later, in Phase 8) the action tools; the registry is the single source of truth for what the agent can call.
  2. The 9 Phase-1 read tools are callable end-to-end and return tenant-scoped results: `revenueByDay`, `revenueByPlatform`, `revenueByZone`, `courierLeaderboard`, `courierProfile`, `violationsList`, `cashOutstanding`, `attendanceForPeriod`, `liveFleetStatus`, `gpsTrack`, `searchOrders`. (`forecastDemand` and `forecastSupplyGap` are deferred to Phase 11/12.)
  3. The five new Prisma models (`AgentAction`, `AgentMemory`, `PinnedView`, `PerformanceSnapshot`, `MetricEvent`) are migrated to the database, indexed for tenant-scoped reads, and exposed via Prisma client without breaking existing migrations.
  4. Every new agent route passes through the existing `tenantScope` middleware; an automated check (lint or test) catches any new agent-touching route that omits tenant scoping.
**Plans**: 5 plans
Plans:
- [ ] 01-00-PLAN.md — Wave 0: ESLint custom rule + Wave 0 RED test scaffolding (safety net)
- [ ] 01-01-PLAN.md — Wave 1: Add 5 new Prisma models + relocate services/agents/ → agent/
- [ ] 01-02-PLAN.md — Wave 2: Implement 5 data primitives (ledger, memory, pinnedView, metricEvent, performanceSnapshot writer + worker)
- [ ] 01-03-PLAN.md — Wave 3: 11 read tools registered + tools/strict + tools/tenantIsolation tests green
- [ ] 01-04-PLAN.md — Wave 4: [BLOCKING] prisma migrate dev + delete legacy services + walking-skeleton green

### Phase 2: Decisions Surface + Propose-and-Confirm + Design Partner #1
**Goal**: Ship the owner's primary daily surface and onboard the first paying fleet. Decisions is the proposal inbox — a stack of agent-generated cards the owner approves, modifies, or dismisses. The continuous-monitoring loop fills the inbox every minute. Pricing and white-glove onboarding go live so design partner #1 can be charged KD 100/month as a co-design discount against the public KD 200/month floor.
**Depends on**: Phase 1 (agent module + AgentAction model + read tools)
**Requirements**: REQ-decisions-proposal-inbox, REQ-agent-continuous-monitoring, REQ-agent-action-drafting, REQ-agent-propose-confirm, REQ-pricing-model, REQ-gtm-onboarding
**Success Criteria** (what must be TRUE):
  1. An owner logging in lands on `/decisions` (route name to be confirmed against PRD section 9 Q1 reference to `/home`; see PROJECT.md → Open Questions) and sees a stack of proposal cards, each shaped per CON-decisions-card-shape (coloured tag + driver name + headline + two-line reasoning + Approve / Modify / Dismiss). No KPI strip, no leaderboard.
  2. The continuous-monitoring loop runs every minute (BullMQ scheduled job), scans for the five anomaly classes (offline-during-shift, GPS-stale, rejection spikes, cash overdue, performance regression), and writes proposal items to the inbox.
  3. Clicking Approve fires the proposed action through the agent's action-orchestrator, which writes a row to `AgentAction` with proposer="Darb", approver=user-id, originalProposal, modificationsBeforeApproval, outcome, reasoning. No write-action ever fires without a click — verified by automated tests.
  4. Clicking Dismiss closes the proposal AND writes a "trained-against" signal to `AgentMemory` so the agent proposes differently next time.
  5. A working pricing model (KD 2/active-courier/month, KD 200/month minimum) is wired into the billing pipeline and produces a correct invoice for design partner #1 at the KD 100/month co-design rate.
  6. A 14-day free-trial flow exists, and the white-glove onboarding script (ingest 30 days of data → produce "Darb's read on your fleet" report → present as the close) has been run end-to-end for design partner #1.
**Plans**: 6 plans
Plans:
- [ ] 02-00-PLAN.md — Wave 0: RED test scaffolding (17 backend tests + 10 gold-set fixtures + 2 frontend component tests + lint:tenant scope extension)
- [ ] 02-01-PLAN.md — Wave 1: Schema additions (Tenant + User) + super-admin middleware + monitor agent + 3 propose tools + listAgentMemory + monitor.md prompt + tiered cron
- [ ] 02-02-PLAN.md — Wave 2: /api/decisions/* + /api/audit/* routes + cardProjector + evidenceCollector + approve/dismiss/undo handlers
- [ ] 02-03-PLAN.md — Wave 3: /decisions page + /decisions/audit + /decisions/[id] + 12 components + sidebar update + 30s polling
- [ ] 02-04-PLAN.md — Wave 4: /api/admin/onboarding/* + /api/admin/billing/* + billingService + onboardingBackwashWorker + onboardingReport service
- [ ] 02-05-PLAN.md — Wave 5: /admin/onboarding 5-step wizard + /admin/billing UI + DarbsReadReport + [BLOCKING] prisma migrate dev + design partner #1 dry-run
**UI hint**: yes

### Phase 3: Driver File
**Goal**: Ship the canonical per-driver page that becomes the source of truth before any owner approves a fire/promote action. Click any driver name anywhere in the app → land on the Driver File. All eight required sections present (CON-driver-file-sections). Performance score backed by `PerformanceSnapshot` (computed once per day, not on every read) and the agent must be able to explain the score in plain English.
**Depends on**: Phase 1 (PerformanceSnapshot, AgentAction, agent module), Phase 2 (Decision audit log section pulls from AgentAction rows)
**Requirements**: REQ-driver-file, REQ-agent-scoring
**Success Criteria** (what must be TRUE):
  1. Every driver name in the app (in Decisions cards, in the Operations lists shipping later, in chat-generated tables) is clickable and routes to `/drivers/[id]` showing the canonical Driver File.
  2. The Driver File renders all eight sections: Profile (name/photo/vehicle/platform/contract terms); Live status + today's orders; 90-day Performance score trend; Violations history; Cash history; Attendance + shifts; Agent's running notes; Decision audit log filtered to this driver.
  3. The Performance score is read from `PerformanceSnapshot` (daily snapshot, not recomputed per request); the 90-day trend chart renders in <300ms.
  4. Asking the agent "why is this driver scored at X?" returns a plain-English explanation derived from the score's contributing factors.
**Plans**: 5 plans
Plans:
- [ ] 03-00-PLAN.md — Wave 0: 14 RED test files (8 backend + 6 frontend) + 5 gold-set fixtures + lint:tenant scope extension to services/driverFile/
- [ ] 03-01-PLAN.md — Wave 1: score-explainer agent + scoreExplainer service (1h AgentMemory cache, compositeScore-keyed) + performanceTrend (13th read tool) + GET /api/drivers/:id/file aggregate route + decisionAuditFilter + agentNoteWriter
- [ ] 03-02-PLAN.md — Wave 2: <DriverLink> global primitive + 14-site cross-app retrofit sweep + /drivers/[id] page shell + DriverFileShell + DriverFileSkeleton + DriverFileScrollSpy + DriverFileHeader + PerformanceScoreCard + ScoreGauge + SubScoreBar
- [ ] 03-03-PLAN.md — Wave 3: 6 remaining sections — NinetyDayTrendChart (Recharts) + CustomScoreTooltip + RecentShiftsTable + RecentOrdersTable + ViolationsList + CashSnapshot + AgentNotes (reusing Phase 2 AuditEntryDetail SlidePanel)
- [ ] 03-04-PLAN.md — Wave 4: Legacy redirects (4 platform-prefixed [id]/page.tsx → redirect stubs) + AskDarbWhyDrawer with /api/drivers/:id/score-explanation Refresh path + Driver360 retirement to _legacy/ + smoke integration test + human-verify checkpoint
**UI hint**: yes

### Phase 4: Chat / Generative UI + WebSocket
**Goal**: Ship the chat surface that replaces ~50 pre-built analytics pages. ⌘K opens it from anywhere; it's pinned in the sidebar; conversation history is per-user and searchable. Any analytical question generates an inline mini-dashboard (KPI tiles / table / time series / mini-map / comparison cards), with a "Pin to Home" button on every generated view. Chat can also propose actions and run scheduled jobs (pinned briefings + standing-rule templates). WebSocket is added to stream chat tokens and (later, Phase 7) live floor map subscriptions; SSE for notifications continues to work.
**Depends on**: Phase 1 (agent module + read tools + PinnedView model)
**Requirements**: REQ-chat-global-access, REQ-chat-generated-dashboards, REQ-chat-action-proposals, REQ-chat-scheduled-jobs, REQ-agent-natural-language-qa, REQ-realtime-streaming
**Success Criteria** (what must be TRUE):
  1. ⌘K (cmd+K / ctrl+K) opens the chat from any page; the chat is pinned in the sidebar and shows the user's conversation history sorted by recency.
  2. Asking "Why did revenue drop yesterday in Hawally?" returns an inline 3-tile KPI strip + Tue-vs-Wed bar chart by hour + amber callout naming the no-show drivers + three action buttons (Draft warnings, Reassign tomorrow, Pin to home) — all without navigating to a separate page.
  3. Asking the agent to do something ("apply a 10 KD penalty to drivers who missed shift today") returns a list, the proposed payroll deduction, the WhatsApp draft, and a confirm card; the action does not fire until Approve is clicked.
  4. Clicking "Pin to Home" on a generated view writes a row to `PinnedView` and the next time the user lands on Home (Decisions or `/home`), the pinned tile renders.
  5. Tokens stream into the chat via WebSocket; existing SSE notifications still work; both transports coexist without breaking the existing `notifications` route.
**Plans**: 6 plans
Plans:
- [ ] 04-00-PLAN.md — Wave 0: 17 RED test files (11 backend + 6 frontend) + 13 gold-set fixtures + cmdk@^1.1.1 install + lint:tenant glob extension to 7 new Phase 4 backend files
- [ ] 04-01-PLAN.md — Wave 1: schema additions (3 models — ChatThread/ChatMessage/ScheduledBriefing + 6 columns on PinnedView/AgentAction) + describeView tool (Zod discriminated union, 9 viewTypes) + chatHistoryService + chat.md prompt + runAgent stream:{onTextDelta/onView/onPendingAction/onCancel} + frontend types
- [ ] 04-02-PLAN.md — Wave 2: SSE chat route (/api/ai/chat/stream) + chat threads/messages CRUD (/api/chat/*) + per-thread Redis lock + 15s heartbeat + cancel via Redis flag + extended /api/decisions/:id/approve to accept source/threadId/msgId
- [ ] 04-03-PLAN.md — Wave 3: cmdk-based ⌘K palette rewrite + /chat 3-column shell + 9 viewBlock renderers (Recharts/React-Leaflet/StatCard/DataTable) + ChatActionCard reusing /api/decisions/:id/approve + useStreamingChat (SSE) + useChatThreads hooks
- [ ] 04-04-PLAN.md — Wave 4: /api/pinned-views CRUD + refresh + PinnedViewsRail/PinnedViewTile/UnpinConfirm on /decisions + sidebar Chat nav + ⌘K trigger pill + /copilot 308 redirect to /chat
- [ ] 04-05-PLAN.md — Wave 5: scheduledBriefingsService + BullMQ JobScheduler worker (standing-rule type=no-op) + /api/scheduled-briefings CRUD + ScheduledBriefingsList UI at /chat/scheduled + [BLOCKING] prisma migrate dev + tsvector GIN index for FTS + final phase verification
**UI hint**: yes

### Phase 5: Mobile GPS Beacon
**Goal**: Promote the Expo courier app from a basic agent app to the cross-platform GPS / telemetry beacon. This is the data moat. Always-on background GPS while logged in (with deliberate battery + permission UX), active-platform detection (which delivery app is foregrounded), photo capture for delivery proof.
**Depends on**: Phase 1 (backend agent module to receive the GPS stream), Phase 2 (Decisions surface to expose GPS-stale anomalies)
**Requirements**: REQ-mobile-always-on-gps, REQ-mobile-active-platform-detection, REQ-mobile-delivery-photo-capture
**Success Criteria** (what must be TRUE):
  1. A courier logged into the Darb mobile app has their GPS streaming continuously to the backend in the background, regardless of which delivery app (Keeta, Talabat, Deliveroo, Americana) is foregrounded; the GPS feed survives screen-off.
  2. The mobile app reports which delivery app is currently foregrounded so per-platform attribution is captured without scraping.
  3. The battery and location-permission UX is treated as a deliberate deliverable: explicit pre-permission screens, fallback prompts for OS-denied permission, battery impact disclosed and within a stated budget.
  4. A courier can capture a delivery photo from inside the Darb app and the photo is associated with the correct order.
**Plans**: 5 plans
Plans:
- [x] 05-00-PLAN.md — Wave 0: jest-expo bootstrap + RED test scaffolding (10 mobile tests + 5 backend tests) + lint:tenant scope extension to Phase 5 backend files
- [x] 05-01-PLAN.md — Wave 1: Mobile foundation — expo-sqlite outbox replaces AsyncStorage (Pitfall 1); iOS activityType + Android 14 FOREGROUND_SERVICE_LOCATION (Pitfalls 2/3); expo-battery telemetry; platformGuess hint module; locationService rewrite
- [x] 05-02-PLAN.md — Wave 2: Backend additions — activePlatformAttribution service (tiered evidence chain over OrderEvent → Shift → Driver default → mobile hint); R2 presigned URL service; agentRateLimit middleware; agent.ts extended with idempotency + upload-url + delivery-photo routes
- [ ] 05-03-PLAN.md — Wave 3: Mobile UX — photoService capture pipeline (compress → presigned PUT → metadata POST); PermissionRationale two-stage modal; BatteryStatusBadge; dashboard Start Shift wired to rationale; orders Mark Delivered button; tab focus → setLastTab
- [ ] 05-04-PLAN.md — Wave 4: [BLOCKING] EAS native rebuild (iOS + Android) + R2 bucket creation + Vercel prod env vars + 4-hour battery test (target ≤6%/hr) + 1km walking smoke + delivery-photo round-trip + VERIFICATION.md
**UI hint**: yes

### Phase 6: Ingest Adapter Layer
**Goal**: Wrap existing Keeta / Talabat / Deliveroo / Americana scrapers behind a swappable adapter interface (CON-scraper-replaceable). Where mobile-app data sources exist (GPS, courier check-ins), prefer those over scraped data. Ensure every platform has an XLSX-import fallback (CON-xlsx-fallback) — the existing Keeta `POST /import` route is the reference pattern.
**Depends on**: Phase 5 (mobile GPS as preferred data source must exist before we can prefer it)
**Requirements**: REQ-ingest-adapter-layer
**Success Criteria** (what must be TRUE):
  1. All four platforms (Keeta, Talabat, Deliveroo, Americana) have their ingest paths sitting behind a single `IngestAdapter` interface; replacing a scraper requires zero changes outside the adapter module.
  2. Every platform has a working XLSX-import fallback route shaped like Keeta's existing `POST /import`.
  3. For metrics where both mobile-GPS data and scraped data exist (e.g., online hours, location), the system reads from mobile-GPS by default and falls back to scraped data only when mobile is unavailable.
**Plans**: 6 plans
Plans:
- [x] 06-00-PLAN.md — Wave 0: 13 RED test files + 4 XLSX fixture builders + lint negative fixture + lint:tenant scope extension to services/ingest/
- [x] 06-01-PLAN.md — Wave 1: Core scaffolding (types/composite/registry/audit/normalize/index/xlsxRouteFactory) + OrderSource.MOBILE_GPS schema edit + migration
- [x] 06-02a-PLAN.md — Wave 2a (parallel with 02b): Keeta×4 + Americana×3 adapter files + registry update (consumes 02b's barrels)
- [ ] 06-02b-PLAN.md — Wave 2b (parallel with 02a): Talabat×6 + Deliveroo×6 adapter files
- [ ] 06-03-PLAN.md — Wave 3: POST /api/talabat/import + POST /api/deliveroo/import via makeXlsxImportRoute factory
- [ ] 06-04-PLAN.md — Wave 4: pullChunkPhase6 + Keeta /import refactor + keetaPortalScraperWorker refactor + Phase 6 close-out (migration applied in Wave 1)

### Phase 7: Live Floor (Map + Pills + Courier Panel)
**Goal**: Ship the dispatcher's primary daily surface. Live map of Kuwait at `/floor`, all platforms, real-time, glanceable, stays open all shift. Driver dots colour-coded per CON-floor-dot-colors and platform-tagged. Three pill counters at top per CON-floor-counters. Click a dot → right panel slides out with full driver context. One action: "Ping (WhatsApp)" — agent drafts message, dispatcher one-clicks send. Live updates ride the WebSocket transport from Phase 4.
**Depends on**: Phase 4 (WebSocket transport), Phase 5 (mobile GPS feed populates the dots), Phase 1 (read tools `liveFleetStatus`, `gpsTrack`)
**Requirements**: REQ-floor-live-map
**Success Criteria** (what must be TRUE):
  1. A dispatcher landing on `/floor` sees a live map of Kuwait with every online driver as a coloured dot; dot colours follow CON-floor-dot-colors (green=working, grey=idle, red=GPS-stale, blue=scheduled-not-online); each dot carries a platform-colour tag.
  2. The three pill counters at the top show live counts for Scheduled-not-online, GPS-stale (>10 min), Order-rejection ×3+; clicking any counter filters the map to those drivers.
  3. Clicking a dot opens a right-slide panel showing phone, vehicle, current order, last GPS, today's stats; the panel can be dismissed without losing map state.
  4. The "Ping (WhatsApp)" button on the panel produces an agent-drafted message; one click sends it (after a confirm card).
  5. Map state updates in real time via WebSocket; existing SSE notifications continue to work in parallel.
**Plans**: 5 plans
Plans:
- [ ] 07-00-PLAN.md — Wave 0: RED tests (10 backend + 8 frontend) + shared fixtures
- [ ] 07-01-PLAN.md — Wave 1: Backend wire-in (DarbEventType extension, publishEvent in POST /api/agent/location, liveFleetStatus.orderRejectionCount, orderRejectionToday tool, /api/floor router with /snapshot + /counters + /ping)
- [ ] 07-02-PLAN.md — Wave 2: Frontend foundation (pin react-leaflet@4.2.1 + react-leaflet-cluster@2.1.0, types/floor.ts, LiveFloorMap, CourierMarker, useFloorRealtime hook)
- [ ] 07-03-PLAN.md — Wave 3: UI composition (/floor route, LiveFloorPage, FloorPillCounters, FloorFilters, CourierDetailPanel, PingButton, FloorListOverlay)
- [ ] 07-04-PLAN.md — Wave 4: Polish (flight-mode visual, ConnectionIndicator, EmptyFloorState, SSE reconnect integration test, Vercel maxDuration=300)
**UI hint**: yes

### Phase 8: Finance Workbench + Action Tool Surface (the moat)
**Goal**: Ship the accountant's primary daily surface AND the full action-tool surface that is the engineering moat. Cash workbench covers Keeta / Talabat / Deliveroo (CON-cash-platform-coverage; Americana excluded). Payroll computes weekly pay, applies violation deductions, exports bank file. Invoices cover all four platforms. Expenses & P&L is a full month/quarter view. The full 10-tool action surface goes live, every tool wired through propose-and-confirm with full `AgentAction` audit rows.
**Depends on**: Phase 1 (AgentAction model + agent module), Phase 2 (propose-and-confirm pattern established)
**Requirements**: REQ-finance-cash-workbench, REQ-finance-payroll, REQ-finance-invoices, REQ-finance-expenses-pl, REQ-agent-action-tools
**Success Criteria** (what must be TRUE):
  1. An accountant logging in lands on `/finance/cash` and sees driver receivables across Keeta, Talabat, Deliveroo (Americana absent by design), with reconciliation, age buckets, and agent-drafted reminder messages.
  2. Payroll computes weekly pay end-to-end, applies deductions for violations from `Violation` records, generates a payslip per driver, and exports a bank file in the expected format.
  3. Invoices view shows incoming invoices from all four platforms (what platforms owe the fleet) with reconciled vs unreconciled tabs.
  4. Expenses & P&L view tracks vehicle maintenance / fuel / rent / office staff salaries / utilities and renders a full P&L with month and quarter cuts.
  5. All 10 action tools are callable from the agent (`draftCourierMessage`, `sendCourierMessage`, `applyPenalty`, `suspendDriver`, `reassignShift`, `flagForReview`, `createTrainingTask`, `recordCashSettlement`, `escalateToHumanSupervisor`, `generatePayrollAdjustment`); each emits a confirm card per CON-action-confirm-card; each writes a CON-audit-row-shape compliant row to `AgentAction` on Approve.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Mobile Agent Inbox + Bilingual Outbound
**Goal**: Couriers receive agent-drafted messages directly in the Expo app via a WhatsApp-style inbox. All outbound courier comms (WhatsApp, SMS, in-app inbox) are drafted bilingual (English + Arabic) per CON-bilingual-outbound. Owner-facing UI remains English-first; full RTL UI is deferred to Y2.
**Depends on**: Phase 5 (mobile app foundations), Phase 8 (the action tools that draft the outbound messages)
**Requirements**: REQ-mobile-agent-inbox, REQ-bilingual-courier-comms
**Success Criteria** (what must be TRUE):
  1. A courier logged into the Darb mobile app has a WhatsApp-style inbox screen showing agent-drafted messages directed at them; the inbox supports read/unread state and quick reply.
  2. Every outbound courier message produced by `draftCourierMessage` carries both English and Arabic body text; the courier's preferred language determines which is shown first; both are stored on the message record.
  3. SMS and WhatsApp send paths both honour the bilingual draft.
  4. Owner-facing chat, Decisions, Driver File, Floor, Finance, Operations, HR remain English-only (LTR) in v1; no RTL UI work is shipped.
**Plans**: TBD
**UI hint**: yes

### Phase 10: Operations Per-Platform + HR + Hide-Behind-Flag
**Goal**: Ship the per-platform Operations sections (Drivers / Orders / Violations sub-pages for each of Keeta, Talabat, Deliveroo, Americana) and the HR module (Employees, Leave, Documents). Hide ~50 legacy pages (`/v2`, `/overview`, `/insights`, `/analytics`, `/kpis`, `/tickets`, most platform-specific deep pages) behind a feature flag — pages NOT deleted, remain resurrectable. Components from well-built legacy pages (`keeta/violations`) are harvested; engines survive, pages do not (subject to founder confirmation per PRD section 13 question 7).
**Depends on**: Phase 3 (Driver File — Operations Drivers sub-pages link into it), Phase 4 (chat surface — collapsed pages route users to chat), Phase 8 (Finance must exist before legacy `/overview` is hidden)
**Requirements**: REQ-operations-per-platform-sections, REQ-hr-employees, REQ-hr-leave, REQ-hr-documents
**Success Criteria** (what must be TRUE):
  1. Each of the four platforms (Keeta, Talabat, Deliveroo, Americana) has exactly three sub-pages — Drivers, Orders, Violations — and no per-platform attendance / shifts / performance / vehicle pages remain visible.
  2. HR has three pages — Employees (office staff: supervisors, accountants, dispatchers with contracts/salaries/civil ID/contacts), Leave (annual / sick / public holidays for office staff only), Documents (visa / civil ID / contract expiry tracking with expiry alerts surfacing in Decisions).
  3. The legacy pages (`/v2`, `/overview`, `/insights`, `/analytics`, `/kpis`, `/tickets`, most platform-specific deep pages) are gated behind a feature flag; default-off in production; resurrectable by toggling the flag.
  4. The `keeta/violations` engine continues to flag violations and feed them into Decisions cards and the Operations Violations sub-page; the standalone page is harvested for components and removed from the visible nav.
**Plans**: TBD
**UI hint**: yes

### Phase 11: Scheduled Briefings + Trust Graduation v2 + Mature Memory + Partner-API Outreach
**Goal**: Q3 milestone — graduate the agent to v2 autonomy. Daily/weekly bilingual briefings ship for owner / accountant / dispatcher. Three low-risk action classes auto-execute (routine pings, scheduled reminders, GPS-stale notifications) with rate limits AND per-tenant caps per CON-rate-limits-v2-autonomy; money-touching and HR-touching actions remain propose-and-confirm. Per-tenant `AgentMemory` matures — the agent learns the fleet's preferences (e.g., "owner prefers Friday warnings over Thursday"). Anomaly detection promoted from `aiAnomalyService` to Decisions' primary signal. Open formal partner-API conversations with Keeta + Talabat once 5+ paying fleets exist.
**Depends on**: Phase 8 (action tools shipped → can graduate three of them), Phase 9 (bilingual outbound → briefings can reach couriers in Arabic)
**Requirements**: REQ-agent-scheduled-briefings, REQ-agent-trust-graduation, REQ-agent-long-term-memory, REQ-ingest-partner-api-conversations
**Success Criteria** (what must be TRUE):
  1. The owner receives a morning briefing every day summarising yesterday and surfacing today's top 3 risks; the accountant receives a weekly cash digest; the dispatcher receives a daily floor pre-brief; briefings touching couriers are bilingual.
  2. The three v2 auto-execute action classes (`sendCourierMessage` for routine pings, scheduled reminders, GPS-stale dispatcher notifications) fire without a confirm card when within their rate limit AND per-tenant cap; every other action class still emits a confirm card and writes the same `AgentAction` rows.
  3. The agent's per-tenant `AgentMemory` accumulates owner preferences, courier history notes, and decision patterns; querying the agent ("what does the owner usually do with 3-strike absentees?") returns a memory-grounded answer.
  4. Anomaly detection from `aiAnomalyService` feeds Decisions as the primary signal source — at least 70% of inbox cards trace to an anomaly the service flagged.
  5. Formal partner-API conversations with Keeta and Talabat are initiated (gated by 5+ paying fleets and the legal posture confirmed by founder per PRD section 13 question 6).
**Plans**: TBD

### Phase 12: Owner-Authored Standing Rules + Forecasting
**Goal**: Q4 milestone — ship the v3 autonomy primitive: owner-authored standing rules ("auto-warn 3-strike absentees"). The owner authors a rule once; the agent runs it forever; the owner gets a weekly digest of what the agent did. Add the two forecasting read tools (`forecastDemand`, `forecastSupplyGap`). Exit at 10 paying fleets, KSA market validation begun.
**Depends on**: Phase 11 (mature memory + auto-execute autonomy patterns established)
**Requirements**: REQ-data-agent-rule
**Success Criteria** (what must be TRUE):
  1. The `AgentRule` Prisma model is migrated and a "Standing Rules" authoring UI exists; an owner can author a rule like "if a courier is GPS-stale > 15 min during a shift, draft a ping" and approve it once.
  2. Once authorised, the rule runs against new data without further owner input; every fired action under a standing rule still writes a CON-audit-row-shape compliant row to `AgentAction` with the rule id as a reference.
  3. A weekly digest emails the owner a list of every action fired under their standing rules in the past week, with one-click "stop this rule" controls.
  4. `forecastDemand(zone, hourBucket)` and `forecastSupplyGap(zone, hourBucket)` are callable from the agent and return predictions used by chat answers ("Will Hawally be short tomorrow at 7pm?").
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Agent Spine + Data Architecture | 0/5   | Planned     | - |
| 2. Decisions Surface + Propose-and-Confirm + Design Partner #1 | 0/6 | Planned | - |
| 3. Driver File | 0/5 | Planned | - |
| 4. Chat / Generative UI + WebSocket | 0/TBD | Not started | - |
| 5. Mobile GPS Beacon | 0/5 | Planned | - |
| 6. Ingest Adapter Layer | 0/TBD | Not started | - |
| 7. Live Floor (Map + Pills + Courier Panel) | 0/TBD | Not started | - |
| 8. Finance Workbench + Action Tool Surface | 0/TBD | Not started | - |
| 9. Mobile Agent Inbox + Bilingual Outbound | 0/TBD | Not started | - |
| 10. Operations Per-Platform + HR + Hide-Behind-Flag | 0/TBD | Not started | - |
| 11. Scheduled Briefings + Trust Graduation v2 + Mature Memory + Partner-API Outreach | 0/TBD | Not started | - |
| 12. Owner-Authored Standing Rules + Forecasting | 0/TBD | Not started | - |
