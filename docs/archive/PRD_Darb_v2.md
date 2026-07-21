# Darb v2 — Product Requirements Document

**Author:** CTO/co-founder draft
**Status:** Draft v0.1 — for founder review
**Date:** May 2026
**Decision needed by:** End of week (gates the next 12 months of engineering)

---

## 0. TL;DR

Darb is pivoting from a **multi-platform fleet dashboard** to **the AI ops chief for delivery fleet owners in the Gulf** — Kuwait first.

The hero job is **driver performance and retention**: an AI agent that watches every courier across Keeta, Talabat, Deliveroo, and Americana simultaneously, ranks them, explains why, and proposes actions (warn, coach, promote, fire) that the owner approves with one click.

Around that, we keep a tight set of glanceable "watchtower" screens for live ops — but every analytical question, every report, every action goes through one chat-driven surface that generates the view it needs on the fly.

**One sentence pitch:** *"Replace your WhatsApp group + Excel sheet with an AI that runs your fleet's performance for you, in 20 minutes a day."*

---

## 1. The Pivot — why now, why this shape

We are pre-revenue, with no sticky use case, building a category (multi-platform fleet management) that aggregators will eventually expose themselves. Eighty-plus dashboard pages mostly clone what Keeta and Talabat already show their partners. That is not a moat.

Three structural facts decide the shape of the product:

1. **Our mobile app on the courier's phone gives us cross-platform GPS that no individual platform has.** Keeta knows where the courier is *when working for Keeta*. We know where they are all day, on every platform. That is the data moat.
2. **The buyer is the fleet owner. They don't open dashboards — they ask questions and want answers.** "Who's not performing?" "Where's my cash?" "Why did orders drop yesterday?" Their natural interface is a question, not a navbar.
3. **The status quo is Excel + WhatsApp.** Customers are not displacing software, they're displacing chaos. The bar is low for utility but high for trust — they need to believe the agent before they hand over performance decisions.

The pivot follows: keep the data backbone, kill most of the frontend, replace it with one agentic surface plus a small ring of watchtowers, and put all engineering weight behind the agent's *action-taking* tool surface — because action is where the moat lives, not in another chart.

We also decided **English-first for v1**, with Arabic as a fast-follow for courier-facing comms (WhatsApp / SMS) and full RTL UI later. The buyer (owner / GM / accountant) reads English fluently in this segment; the courier comms can be Arabic without us building a fully bilingual UI yet.

---

## 2. Vision

**3-year vision.** Every fleet owner in the GCC who runs 50+ couriers across multiple platforms uses Darb as their daily operating brain. The agent makes >70% of routine performance, scheduling, and cash decisions — owners just approve. We are the system of record for fleet performance in the Gulf.

**12-month goal.** 8–12 paying fleets in Kuwait, KD 6–10k MRR, design-partner depth on at least 3 of them. The product is good enough that the owner opens it daily before opening WhatsApp.

**Non-goals (12 months).** Drivers as a payment platform. A courier-facing super-app. Direct integration with end-customer-facing apps. Replacing the platforms themselves.

---

## 3. Target customer & buyer

**ICP.** Fleet operators in Kuwait running **80–300 couriers** across two or more of {Keeta, Talabat, Deliveroo, Americana}. They are profit-thin, ops-heavy, and currently coordinate via WhatsApp groups + Excel + per-platform partner portals.

**Personas inside the customer:**

- **Owner / GM** (primary buyer, primary daily user). Wants leverage and clarity. Decides on hires, fires, expansions. Will pay if Darb makes them smarter about their drivers.
- **Ops manager / dispatcher** (daily user, glance-mode). Watches the floor in real time. Will reject a chat-only product. Needs watchtowers.
- **Accountant** (heavy weekly user). Reconciles cash, processes payroll, applies deductions for violations. Spreadsheet brain.

We design the agent for the owner and the watchtowers for the dispatcher. The accountant gets a focused workspace surface for end-of-day reconciliation. One product, three lenses.

---

## 4. Product principles

These are the trade-off rules. When a decision comes up, we re-derive from these:

1. **Clarity over completeness.** A correct answer to one question beats a comprehensive page that buries the question.
2. **Action is the moat, not analytics.** Anything that ends in a chart is a feature; anything that ends in an action a human approves is a product.
3. **The watchtower exists; everything else is generative.** Pre-build only the surfaces a dispatcher must glance at. Everything else is rendered by the agent on demand.
4. **Propose-and-confirm is the default autonomy.** No agent action against the world without one human click. This is non-negotiable in v1.
5. **Trust is earned per action class.** First we earn the right to draft messages. Then to apply penalties. Then to schedule shifts. We don't ship the firing button on day one.
6. **Cross-platform unification is the default view.** Single-platform views are special cases, not the home page.
7. **Owner reads English, courier reads Arabic.** UI English-first, all outbound courier comms drafted bilingual.

---

## 5. Surfaces — what we actually build

The full Darb sidebar in v2:

1. **Decisions** — agent's proposals waiting on you
2. **Chat** — Ask Darb anything
3. **Floor** — live map across all platforms
4. **Operations** — Keeta / Talabat / Deliveroo / Americana, each with Drivers, Orders, Violations
5. **Finance** — Cash, Payroll, Invoices, Expenses & P&L
6. **HR** — Employees, Leave, Documents
7. **Settings**

**Drivers** ≠ **Employees**. Drivers (contractors, in Operations) are separate records from office staff (employees, in HR).

**Role-based landing:**
- Owner → Decisions
- Dispatcher → Floor
- Accountant → Finance → Cash
- HR person → HR → Employees

### 5.1 Decisions (default landing for owner)

The owner opens Darb and lands here. One screen, no clutter.

- Stack of agent-generated proposal cards. Each card: a coloured tag (Suspend / Cash reminder / Promote / Warn), the driver's name and headline, the agent's two-line reasoning, and three buttons — *Approve*, *Modify*, *Dismiss*.
- Approving fires the action. Modify opens an editor on the draft. Dismiss closes the proposal and trains the agent to propose differently next time.
- No KPI strip. No leaderboard. If the owner wants a number, they tap Chat.

This screen replaces `/overview`, `/v2`, `/insights`, `/kpis`, `/analytics`, `/tickets`.

### 5.2 Floor (default landing for dispatcher)

Live map of Kuwait, all platforms. Stays open all shift. Real-time. Glanceable.

- Every online driver is a coloured dot — green (working), grey (idle), red (GPS-stale), blue (scheduled-not-online). Each dot tagged with platform colour.
- Three pill counters at top: **Scheduled-not-online**, **GPS-stale (>10 min)**, **Order-rejection ×3+**. Click → filtered list.
- Click a dot → right panel slides out with driver details: phone, vehicle, current order, last GPS, today's stats.
- One action per driver: **"Ping (WhatsApp)"** — agent drafts message, dispatcher one-clicks send.

### 5.3 Chat — Ask Darb, the chat that builds dashboards on the fly

A single chat-style surface, accessible from everywhere via ⌘K and pinned in the sidebar. It does three things:

1. **Answer with a generated dashboard.** Any question about the fleet produces an inline mini-dashboard — a chart, KPI tiles, a callout with the agent's interpretation, and action buttons. Example: "Why did revenue drop yesterday in Hawally?" returns a 3-tile KPI strip (revenue, courier coverage, reject rate), a Tue-vs-Wed bar chart by hour, an amber callout naming the two no-show drivers, and three action buttons: *Draft warnings*, *Reassign tomorrow*, *Pin to home*.
2. **Propose actions.** "Apply a 10 KD penalty to drivers who missed shift today" — agent shows the list, the proposed payroll deduction, the WhatsApp draft, and waits for confirm.
3. **Run scheduled jobs.** Pinned briefings ("every morning at 6, summarise yesterday and surface today's top 3 risks") and standing rules ("if a courier is GPS-stale > 15 min during a shift, draft a ping").

**Generative UI rules:**
- The agent picks the format — table, chart, map, KPI tiles, action card, draft message — based on the question.
- Every generated view has a **Pin to Home** button. Pinned views become tiles on Home. This is how the dashboard grows organically, by user pull, instead of being pre-built.
- Every analytical answer ends in actions the user can take, not just numbers. If the agent surfaces a problem, it offers the fix in the same response.
- Conversation history is per-user and searchable. Yesterday's answer is one click away.

This surface replaces what would otherwise be 50+ pre-built analytics pages.

### 5.4 Operations — per-platform sections

Each platform (Keeta, Talabat, Deliveroo, Americana) has its own section with three sub-pages:

- **Drivers** — sortable list. Score, status, today's orders, last seen. Click a row → full Driver File.
- **Orders** — today's orders for that platform, with status, courier, customer area.
- **Violations** — list of violations on that platform, filterable. Engine flags new ones automatically; surface mirrors what's in Decisions.

No per-platform attendance, shifts, performance, or vehicle pages. Those collapse into Driver File or Chat.

### 5.5 Driver File

Click any driver name anywhere in the app and you land here. One canonical page per driver:

- Profile (name, photo, vehicle, platform, contract terms)
- Live status and today's orders
- Performance score, with trend over 90 days
- Violations history
- Cash history (settlements + outstanding)
- Attendance and shifts
- Agent's running notes (auto-generated observations)
- Decision audit log (every agent proposal touching this driver — approved, modified, dismissed)

This is the source of truth before the owner approves a fire/promote action.

### 5.6 Finance (default landing for accountant)

Four sub-modules:

- **Cash** — driver receivables across platforms (Keeta, Talabat, Deliveroo only — Americana has no driver cash). Reconciliation, age buckets, agent-drafted reminder messages.
- **Payroll** — driver payouts. Computes weekly pay, applies deductions for violations, generates payslips, exports to bank file.
- **Invoices** — incoming from platforms. What Keeta/Talabat/Deliveroo/Americana owe the fleet for completed deliveries.
- **Expenses & P&L** — vehicle maintenance, fuel, rent, office staff salaries, utilities. Full P&L view with month/quarter cuts.

### 5.7 HR (default landing for HR person)

Three sub-modules:

- **Employees** — office staff records (supervisors, accountants, dispatchers). Contracts, salaries, civil ID, contacts.
- **Leave** — annual leave, sick days, public holidays. Office staff only — drivers tracked separately in Operations.
- **Documents** — visa, civil ID, contract expiry alerts. Critical in Kuwait labour law.

---

## 6. The Agent — anatomy

The agent is the thing we are actually building. Everything above is its surface.

### 6.1 What the agent does (capabilities)

- **Continuous monitoring.** Every minute, scan for anomalies — courier offline during shift, GPS-stale, rejection spikes, cash overdue, performance regression. Surface as inbox items.
- **Scoring.** Maintain a live composite score per courier (already partially done in `aiScoringService`). Explain the score in plain English when asked.
- **Q&A.** Natural-language questions over fleet data → generated tables/charts. Tools call into tenant-scoped data.
- **Action drafting.** Translate a goal ("warn the worst 3 today") into a concrete action plan with WhatsApp drafts, penalty entries, audit reasons. Wait for confirm.
- **Scheduled briefings.** Daily/weekly digests for owner, accountant, dispatcher. Bilingual where it touches couriers.
- **Long-term memory.** Per-tenant memory of decisions, owner preferences, courier history. The agent gets smarter at the *specific* fleet's patterns over time.

### 6.2 Tool surface — read tools

The agent's "see" layer. Tenant-scoped, all already partially exist in `aiChiefOfStaffService` — needs to be the canonical surface.

- `revenueByDay`, `revenueByPlatform`, `revenueByZone`
- `courierLeaderboard(metric, order, limit, period)`
- `courierProfile(driverId)` — full file
- `violationsList(filters)`
- `cashOutstanding(filters)`
- `attendanceForPeriod(filters)`
- `liveFleetStatus()` — current online/offline/idle
- `gpsTrack(driverId, period)` — courier movement
- `searchOrders(filters)` — find specific orders by status, time, customer, etc.
- `forecastDemand(zone, hourBucket)` — predicted orders next N hours
- `forecastSupplyGap(zone, hourBucket)` — predicted courier shortfall

### 6.3 Tool surface — action tools (THE MOAT)

This is what's missing today. Every tool below requires a confirm card before firing.

- `draftCourierMessage(driverId, intent, language)` — generates WhatsApp/SMS body
- `sendCourierMessage(messageId)` — fires it (after confirm)
- `applyPenalty(driverId, type, amount, reason, sourceViolationId?)`
- `suspendDriver(driverId, durationDays, reason)`
- `reassignShift(shiftId, newDriverId, reason)`
- `flagForReview(driverId, reason)` — opens a record in the owner's inbox
- `createTrainingTask(driverId, trainingType)`
- `recordCashSettlement(driverId, amount, method, note)`
- `escalateToHumanSupervisor(driverId, reason)` — pings the supervisor on WhatsApp/Slack
- `generatePayrollAdjustment(driverId, period, items[])`

Every action is an audited row in `AgentAction` with: who proposed (always Darb), who approved (the human), what was the proposal, what was modified before approving, what was the outcome, what was the reasoning. This audit log is *the product* over time — it teaches the next agent run.

### 6.4 Autonomy model

- **v1 (months 0–6):** propose-and-confirm only. No action against the world without a human click. We earn trust on draft quality.
- **v2 (months 6–12):** auto-execute three low-risk action classes — **draft+send routine pings**, **schedule reminders**, **GPS-stale notifications to dispatcher** — with rate limits and per-tenant caps. Everything money/HR-touching stays propose-and-confirm.
- **v3 (year 2+):** standing rules ("if a driver misses 3 shifts in a month, auto-draft warning") that the owner authorises once, agent runs forever with weekly digest of what it did.

### 6.5 Generative UI — the analytics replacement

When a user asks something analytical, the agent does not navigate to a dashboard. It generates the view inline:

- Table → rendered as an interactive grid the user can sort/pin
- Time series → chart inline
- Geographic → mini-map
- Comparison → side-by-side cards

These views are ephemeral by default. Users can **pin** any generated view to their personal workspace — that's how the watchtower set grows organically based on what users actually re-open.

---

## 7. Data architecture

### 7.1 Keep — backend foundations

The Prisma schema (40+ models), the AI services, the mobile GPS pipeline, the auth/RBAC/tenant scoping, the BullMQ workers, the SSE notifications — all stay. This was the right backend; only the front-end was over-built.

### 7.2 Add — agent-grade data plumbing

- **`AgentAction` model** — every proposal/approval/outcome (acts as both audit log and training data).
- **`AgentMemory` model** — per-tenant key/value notes the agent maintains ("owner prefers Friday warnings over Thursday").
- **`PinnedView` model** — saved generated views per user (the dynamic dashboard equivalent).
- **`PerformanceSnapshot` model** — daily snapshot per driver for trend analysis (fixes the current pattern of recomputing).
- **`AgentRule` model** — standing rules for v3 ("if X then propose Y").

### 7.3 The scraping problem

Today's data ingest is via headless scraping of Keeta/Talabat partner portals using fleet-owner credentials. **This is fragile and creates legal/relationship risk.** Mitigations:

- Treat the scrapers as an *adapter layer* that can be swapped without affecting the rest of the system.
- Wherever we have an own-app data source (mobile GPS, courier check-ins) we prefer it over scraped data — the goal over 12 months is to *reduce* scraping dependency.
- Build XLSX-import as a permanent fallback for any platform that breaks scraping. The Keeta `POST /import` route is the right pattern.
- Begin formal partner-API conversations with Talabat and Keeta in Q3 — the moment we have 5+ paying fleets is the moment platforms have an incentive to talk.

### 7.4 The mobile app — our strategic asset

The Expo courier app stops being just an "agent app" and becomes the **GPS + cross-platform telemetry beacon**. New responsibilities:

- Continuous background GPS while logged in (with battery/permission UX done well).
- Active-platform detection (which delivery app is foregrounded — gives us per-platform attribution without scraping).
- Photo capture for delivery proof (already partly there).
- WhatsApp-style inbox to receive agent-drafted messages directly without leaving the app.

This is the wedge we don't talk about in marketing but defend technically.

---

## 8. Tech stack — what changes

| Layer | Today | v2 | Reason |
|---|---|---|---|
| Backend | Express + Prisma + PostgreSQL + Redis + BullMQ | **Same** | Solid. No reason to touch. |
| Frontend | Next.js 14 + Tailwind + Shadcn (80+ pages) | Next.js 14 + Tailwind + Shadcn (**~5 pages + chat surface**) | Strip ruthlessly. |
| Agent | Anthropic SDK in `aiChiefOfStaffService` | **Promote to a real layer:** dedicated `agent/` directory, tool registry, action ledger, memory. Use Claude Sonnet 4.6. | Today it's a service; it needs to be the *spine*. |
| Realtime | SSE for notifications | SSE + WebSocket for agent streaming and live floor map | The chat needs streaming, the map needs subscriptions. |
| Mobile | Expo 52, basic | Expo 52 + always-on GPS + agent inbox | New strategic surface. |
| Analytics | None | Add a `MetricEvent` table + lightweight in-product analytics so the agent can "see itself" | Required for the agent to learn what users actually do. |

---

## 9. Roadmap (12 months, by quarter)

### Q1 (May–Jul 2026) — *Wedge*

**Goal:** one fleet (design partner #1) using Home + chat daily for performance decisions.

- Build `agent/` module: tool registry, read-tools wired, action ledger, propose-confirm UI.
- Build Home + Driver File + Chat surface.
- Hide the old frontend behind a feature flag — old pages still exist, new landing is `/home`.
- Onboard one fleet (the one closest to us / most receptive). Treat them as a co-design partner. **Charge them.** Even 100 KD/month proves it has value.
- Mobile app: always-on GPS shipped.

**Exit criterion:** the owner of design partner #1 says "I check Darb before WhatsApp every morning."

### Q2 (Aug–Oct 2026) — *Watchtower & Cash*

**Goal:** add the dispatcher and accountant. Move to 3 fleets paying.

- Build Live Floor (map + alert pills + courier panel). This is the one surface where a real-time map matters.
- Build Cash Workbench. Wire all cash actions through the agent's confirm pattern.
- Add 5 high-value action tools: applyPenalty, suspendDriver, recordCashSettlement, generatePayrollAdjustment, sendCourierMessage.
- Hide behind feature flag: /v2, /overview, /insights, /analytics, /kpis, /tickets and most platform-specific deep pages. Replace with chat-generated equivalents.
- Mobile app: Arabic outbound messages, agent inbox.

**Exit criterion:** 3 fleets paying. >50% of "what the owner used to ask the dispatcher" goes through the chat.

### Q3 (Nov 2026–Jan 2027) — *Trust & Autonomy v2*

**Goal:** 6 fleets. Agent runs the morning standup for them.

- Scheduled briefings shipping daily (owner, accountant). Bilingual outbound.
- Auto-execute three low-risk action classes (pings, reminders, GPS notifications).
- Per-tenant agent memory matures (the agent learns the fleet's preferences).
- Anomaly detection promoted from `aiAnomalyService` to Home's primary signal.
- Begin formal partner-API conversations with Keeta + Talabat.

**Exit criterion:** 6 paying fleets, KD 4–6k MRR, NPS > 40 from owners.

### Q4 (Feb–Apr 2027) — *Standing Rules & GCC prep*

**Goal:** 10 fleets, KD 8–10k MRR, KSA market validation begun.

- AgentRule model: owner-authored standing rules ("auto-warn 3-strike absentees").
- Performance forecasting: agent predicts which couriers will churn / underperform next month.
- Begin KSA platform adapters (Hungerstation, Jahez) in parallel with Kuwait deepening.
- Design v1 of arabic-first UI for the next market.

**Exit criterion:** product is ready for a deliberate KSA expansion in Y2.

---

## 10. Pricing & GTM (sketch — for refinement with sales-minded co-founder)

- **Pricing:** **KD 2 per active courier per month**, KD 200 minimum. A 150-courier fleet = KD 300/mo. Aligns price to value (more couriers = more leverage from the agent).
- **GTM motion:** founder-led sales. We are 7+ engineers and 0 reps. The first 5 customers come from the founder's network. Land via the owner, expand to the dispatcher and accountant inside the customer.
- **Onboarding:** in-person, white-glove. We ingest their last 30 days of data, generate a "Darb's read on your fleet" report, and present it as the close. The report itself sells the product.
- **Free trial:** 14 days with 1 hour of founder onboarding. No self-serve in v1.

---

## 11. Risks (and what we do about them)

| Risk | Severity | Mitigation |
|---|---|---|
| Scraping breaks / partner credentials revoked | **HIGH** | Adapter pattern; XLSX fallback; mobile-app-as-first-source strategy; partner-API conversations Q3. |
| Agent makes a wrong action and owner loses trust | **HIGH** | Propose-confirm is non-negotiable v1. Audit log visible to owner. Rollback per action class. |
| Owners reject chat ("just give me a button") | MEDIUM | Inbox of proposals = *buttons generated by chat*. Owner never has to type a question to use the product. They only chat when curious. |
| Bilingual gap loses us deals | MEDIUM | Arabic for outbound courier comms in Q1. Full RTL UI deferred to Y2. Bilingual demos by founder mitigate gap in interim. |
| 7 engineers in pre-revenue burns runway | MEDIUM | Track 1 (Home + agent) and Track 2 (mobile + data plumbing) in parallel. Reach revenue by Q2. |
| Big fleets demand custom features | MEDIUM | Generative UI absorbs most "just one more report" requests without code. Real custom features only for design partners with explicit deal value. |
| A platform builds the same thing themselves | LOW (12 mo) | Cross-platform is our moat — no single platform will build for their competitors. |

---

## 12. What we are explicitly NOT building (12 months)

- A second mobile app for the owner. Web is fine.
- Direct payment processing.
- Customer-facing (end-user) features.
- A marketplace for couriers to find fleets.
- Replacing the partner platform consoles for non-fleet ops.
- Voice interface to the agent. (Phase 2.)
- Mobile-first chat. The owner uses Darb at a desk; chat is desktop-primary.
- Self-serve signup. Founder-led only until 10 customers.

---

## 13. Open questions (for the founder, before we lock the PRD)

1. **Pricing instinct.** Is KD 2/courier/month believable in your market? Would owners balk above KD 1.5? I want your gut, then we test.
2. **Design partner #1.** Who is it? Name, fleet size, why they would say yes. If we don't have one in mind in two weeks, the Q1 plan is at risk.
3. **Founder bandwidth.** How much of your week can be founder-led sales / co-design with the first 3 fleets? If it's less than 40%, we need to rethink the GTM.
4. **The 7+ engineers.** What are their specialties? PRD assumes ~3 backend, ~2 frontend, 1 mobile, 1 ML/AI. If skew is different, the roadmap shifts.
5. **Arabic voice.** Are you Arabic-native? If yes, we move bilingual outbound forward. If you'll need translators, it stays Q2.
6. **Legal posture on scraping.** Have you had any conversations (formal or informal) with Keeta/Talabat partner ops? Their tolerance shapes Q3.
7. **The deprecated pages.** Some are well-built (the `keeta/violations` work, the cash workflows). Should we treat them as "harvest the components, throw away the page" — i.e., the violation engine survives, the violation *page* doesn't? My recommendation: yes. Confirm.
8. **Stripe-style "approve all" button.** Some owners will want to bulk-approve agent proposals (the busy-and-trusting type). Do we ship that at v1, or only after we have 6 months of confirm-data to know our hit rate?

---

## 14. Decisions I need from you this week to start

1. ✅ / ❌ — Approve the pivot framing (Home + chat + Live Floor, not dashboards).
2. ✅ / ❌ — Approve the hide-behind-flag plan: most existing dashboard pages move behind a feature flag in Q2 (not deleted; we can resurrect any of them if needed).
3. ✅ / ❌ — Approve propose-and-confirm as v1 autonomy. No write-actions without click.
4. ✅ / ❌ — Approve KD 2/courier/month as the pricing target to test.
5. ✅ / ❌ — Commit founder time to design partner #1 in Q1.

If yes to all five, I'll write the engineering kick-off doc next: file-level deletion list, the `agent/` module skeleton, the migration sequence, and the first 4 sprints with named owners.

— end —
