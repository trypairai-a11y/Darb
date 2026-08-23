# DECISIONS.md — Consolidated Decisions Log

**Version:** 0.1
**Date:** 20 April 2026
**Owner:** Khalifa
**Audience:** Claude Code + product + ops + engineering + exec
**Purpose:** Single cross-referenced index of every decision across all Darb PRDs. When two specs disagree, this file wins. Every decision below is traceable back to its source PRD and the feature(s) it governs.

---

## 0. Namespace convention

| Prefix | Source PRD | Scope |
|---|---|---|
| `DR`  | `PRD-RESTRUCTURE.md` | Cross-platform IA, initial interview decisions |
| `DK`  | `KEETA-PARITY-SPEC.md` | Keeta operations parity (implicit) |
| `DT`  | `PRD-RESTRUCTURE.md` (Talabat subset) | Talabat-specific |
| `DD`  | `PRD-DELIVEROO.md` | Deliveroo-specific |
| `DA`  | `PRD-AMERICANA.md` | Americana-specific |
| `DS`  | `PRD-SYSTEM.md` | System-level / SaaS backbone |

Where a decision in a later PRD overrides an earlier one, the override is called out in the **Supersedes** column.

---

## 1. System-level decisions (DS1–DS22)

Source: `PRD-SYSTEM.md`, Decisions Log §6.

| ID | Decision | Features | Supersedes |
|---|---|---|---|
| DS1 | Darb is a **multi-tenant SaaS** targeting 10+ tenants over 12 months. | S1, S2, S3 | — |
| DS2 | Onboarding is **sales-assisted, ops-provisioned**. No self-service signup in v1. | S1 | — |
| DS3 | **AI in v1 = OCR only** (Talabat + Deliveroo). Contract OCR, anomaly detection, digests → v2. | S4 | **Overrides DA5** (contract OCR downgraded from v1 P0 to v2) |
| DS4 | AI cost is **metered via `AiCallLog`**; every tenant has a monthly cap + kill-switch. Default cap $50/mo. | S4 | — |
| DS5 | Mobile app is **driver-only** (screenshots + check-in + notifications). No supervisor app. | — | — |
| DS6 | **7 roles:** `SUPER_ADMIN` · `ADMIN` · `OPS_MANAGER` · `SUPERVISOR` · `ACCOUNTANT` · `BILLING_ADMIN` · `VIEWER`. | S2 | Extends earlier 5-role model from `CLAUDE.md` |
| DS7 | **Permission matrix** lives in one file (`backend/src/auth/permissionMatrix.ts`); single source of truth for routes + UI. | S2 | — |
| DS8 | Global sidebar = **Overview · Analytics · Keeta · Talabat · Deliveroo · Americana · Settings** (+ Tenants for SUPER_ADMIN). | S5, S6 | **Overrides DR-era sidebar list** (KPIs, Insights, Live Map, Tickets, Recruitment, Supervisors dropped/merged) |
| DS9 | "Companies" tab → **Tenants** (SUPER_ADMIN only). | S1 | **Overrides DR-era "Companies" tab** |
| DS10 | KPIs + Analytics + Insights → **one Analytics tab** with sub-sections. | S6 | **Overrides DR-era three-tab split** |
| DS11 | **No invoicing in Darb.** Darb surfaces `TenantUsageSnapshot`; finance invoices externally. `BILLING_ADMIN` reserved for v2. | S3 | **Reconciles Americana billing — DA6 export stays, no Darb invoicing** |
| DS12 | **No transactional email in v1.** All notifications in-app + mobile push. Password reset is SUPER_ADMIN-assisted. | S12 | — |
| DS13 | **No WhatsApp integration** in v1. Flagged as ops risk for Kuwait. | S12 | **Overrides `managerWhatsapp` field in DA2** (removed from `AmericanaStore`) |
| DS14 | **English-only copy in v1**; i18n scaffolding present but no translations committed. | — | **Overrides CLAUDE.md "Arabic/English bilingual"** guidance for v1 |
| DS15 | **Live Map permanently dropped** from core scope. | — | **Overrides DR-era Live Map global tab and F7 Operation Centre** (F7 becomes tenant-opt-in, not core) |
| DS16 | **Tickets + Recruitment → v2.** | — | **Overrides DR-era global tabs** |
| DS17 | **No feature-flag system.** `featureFlags.ts` in repo is emergency escape hatch only. | S11 | — |
| DS18 | **Observability** = Sentry + `pino` structured JSON logs → Axiom / Better Stack. | S7 | — |
| DS19 | **Audit log** covers every mutation; retained 7y for financial / violation, 2y for everything else. PII redacted. | S8 | — |
| DS20 | **Retention** is tiered: 90d hot / 2y cold / 7y archive. Audit + financial always 7y. | S9 | — |
| DS21 | **Environments** = Dev · Staging · Prod. No canary rollouts (no flag system). | S11 | — |
| DS22 | **v1 done** = all 4 platforms ingesting + 5 tenants live + billing-active (externally) for 30 days. | — | — |

---

## 2. Americana decisions (DA1–DA14)

Source: `PRD-AMERICANA.md`, Decisions Log §6.

| ID | Decision | Features | Notes |
|---|---|---|---|
| DA1 | Americana is a **B2B contract fleet**, not a gig platform — finance backbone of Darb. | All A-series | — |
| DA2 | Revenue = **per-order rate per chain**; rates differ by vehicle type (Car vs Bike). Versioned in `AmericanaChainRate`. | A2 | — |
| DA3 | **v1 ships without a margin column.** HR/payroll integration → v2. | A4 | — |
| DA4 | Driver-to-store assignment is **fixed monthly**; changes rare; reason-for-change trail required. | A3 | — |
| DA5 | ~~Chain rates sourced from contract PDFs; Claude vision OCR extracts rate table.~~ **Superseded by DS3** — contract OCR downgraded to v2. v1 uses manual rate CRUD only. | A2 | **Overridden by DS3** |
| DA6 | **Reconciliation lives in the accounting system, not Darb.** v1 delivers monthly XLSX export only. | A8 | — |
| DA7 | Daily HQ XLSX is **full-day snapshot**; parser replaces that day's entry in `dailyOrders[day]`. Idempotent. | A1 | — |
| DA8 | Americana internal violations use **supervisor override only** (no Appeal workflow). | A6 | — |
| DA9 | `LATE_ARRIVAL` grace threshold = tenant setting (default 15 min). Same for Car and Bike. | A6 | — |
| DA10 | Bike vs Car differ **only on delivery radius** for assignment validation. Not on targets, thresholds, or tiers. | A3 | — |
| DA11 | Headcount gap: `needed = round((trailing30Orders / 30) / targetPerDriverPerDay[vehicleType])`. | A4 | — |
| DA12 | **Driver 360 Americana = Profile + Assets + Monthly Orders Grid.** Attendance + violations inline on Profile. | A5 | — |
| DA13 | Performance tier is **composite** of orders + attendance + violations. Gold requires 0 `ESTABLISHED` violations. | A7 | — |
| DA14 | Sidebar reduces from 10 → 5 tabs: **Overview · Drivers · Orders · Violations · Settings**. | A9 | — |

---

## 3. Deliveroo decisions (DD1–DD10)

Source: `PRD-DELIVEROO.md`, Decisions Log §8.

| ID | Decision | Features | Notes |
|---|---|---|---|
| DD1 | Deliveroo contract: **per-order commission only** (no base pay). | D1 | — |
| DD2 | Deliveroo is operationally similar to Talabat — **shared Driver 360**. | D4 | — |
| DD3 | Data source today = driver screenshots + manual Excel. Fix with **mobile AI-OCR**. | D1 | — |
| DD4 | OCR v0.1 extracts **totals only** (cash, tips, deliveries, unassigned, hourly buckets). Per-order rows deferred. | D1 | — |
| DD5 | `orders-cash` combined page → **separate Orders and Cash pages**. | D5 | — |
| DD6 | Overview primary signals: **unassigned orders by zone + top/bottom riders**. | D2 | — |
| DD7 | Unassigned orders **auto-create Violations** with root-cause tagging. | D3 | — |
| DD8 | Shifts + Attendance → **one Schedule page** for Deliveroo (smaller fleet). | D6 | — |
| DD9 | All other Deliveroo sub-tabs kept (Phones, Vehicles, Violations). | D8 | Phones/Vehicles actually merge into Driver 360 Assets per **DR12** |
| DD10 | Performance tiers use **Deliveroo-specific thresholds** (acceptance + UTR). | D7 | — |

---

## 4. Restructure + Talabat + Keeta decisions (DR1–DR18)

Source: `PRD-RESTRUCTURE.md`, Decisions Log §. These came out of the 20 Apr 2026 interview and are a mix of IA, Talabat, and Keeta calls. Preserved numbering for traceability.

| ID | Decision | Features | Supersedes / Superseded by |
|---|---|---|---|
| DR1 | Start with **Platform tabs** (not Global). | — | Platform tabs built first; Global layers added by S5/S6 |
| DR2 | Primary users: **Osama (Admin) + Ops Manager**. | — | — |
| DR3 | Top pain: **too many tabs / hard to find things**. | R11, A9, DS8 | — |
| DR4 | Depth = **quick audit + recommendations**. | — | Retired after full PRDs written (this doc, PRD-SYSTEM.md, PRD-AMERICANA.md, PRD-DELIVEROO.md) |
| DR5 | Fix **Talabat ingestion via AI OCR on driver mobile app**. | R1 | — |
| DR6 | Attendance daily focus: **"on shift now"** + late/no-show alerts. | R7 | — |
| DR7 | Orders daily focus: **end-of-day reconciliation**. | R1, R8 | — |
| DR8 | Keep tabs; add top-level **Overview** per platform (renamed from "Today"). | R2 | — |
| DR9 | Cash v1 = **COD per driver only**. | R8, D5 | — |
| DR10 | Violations = **full auto-detection engine**. | R5, D3 | — |
| DR11 | Performance core metrics: **UTR + on-time %**. | R9 | Extended by DD10 (Deliveroo) and DA13 (Americana composite) |
| DR12 | Phones + Vehicles → **Driver 360 → Assets**. | R10 | Applied per platform (Americana: DA14) |
| DR13 | **Overview is the platform landing page.** | R2 | — |
| DR14 | Keeta must-haves = **Monitor + Violation engine**. Drop Map, Order Flow, Penalties page. | R4, R5 | **F7 (Operation Centre) reinstated tenant-opt-in per DS15**; Order Flow still dropped |
| DR15 | Keeta ingestion = **scheduled scraper/RPA against partner portal**. | R6 | — |
| DR16 | Keeta appeals stay on Keeta platform — **Darb shows read-only status**. | R5 | — |
| DR17 | **GPS-stale chain**: alert + Ops notify → driver app ping → auto-violation >30 min → escalate to Supervisor. | R5 | — |
| DR18 | Keeta **mostly mirrors Talabat structure**, with Keeta-specific extras where warranted. | — | — |

---

## 5. Keeta-specific (KEETA-PARITY-SPEC.md, DK1–DK8)

`KEETA-PARITY-SPEC.md` does not maintain a separate decisions table; its decisions are implicit in the feature specs (F7–F14) and its "Amendments" section. Decoded here for the index.

| ID | Decision (implicit) | Source | Features |
|---|---|---|---|
| DK1 | KPI cards compute **DoD + WoW deltas server-side**; trend chart has accumulative/discrete toggle. | F8 | Overview KPIs |
| DK2 | Courier Details uses **3-hour attendance slot grid** (not 1-hour). | F9 | Attendance |
| DK3 | Shift Live Monitor tracks **under-shift compliance**; couriers short of min hours trigger notification. | F10 | Attendance, Shifts |
| DK4 | **Partner Target Management = Keeta's native incentive engine**, mirrored into Darb as an advisory layer. | F11 | Performance |
| DK5 | **Financial Management module** (Billing, TaxInvoice, Withdrawal) scoped to **partner side** — not tenant invoicing (see DS11). | F12 | Finance |
| DK6 | **Data Report** = 3-tab trend explorer (orders, couriers, quality). | F13 | Analytics |
| DK7 | All paginated tables must support **page-jump + virtualization** for 1k+ rows. | F14 | Global UI polish |
| DK8 | Keeta **visual parity** maintained via design tokens (red `#E63946`, dark sidebar `#1A1A2E`). | Design tokens appendix | S10 |

**Keeta v1 scope adjustments per system-level decisions:**
- F7 (Operation Centre / Live Map) → **opt-in per tenant**, not default core (per DS15).
- F12 (Financial Management) → **partner-statement only**, not Darb-issued invoicing (per DS11).
- All F-series Arabic strings → **deferred to v2** (per DS14); English-first UI in v1.

---

## 6. Cross-references: decisions by topic

### Authentication, roles, and access
- **Roles:** DS6, DS7, DR2
- **Impersonation:** DS1 (§S1)
- **Password reset:** DS12 (no email → ops-assisted flow)

### Ingestion and data sources
- **Talabat:** DR5, DR7 (mobile AI-OCR end-of-shift)
- **Keeta:** DR15 (portal scraper)
- **Deliveroo:** DD3, DD4 (mobile AI-OCR, totals only v0.1)
- **Americana:** DA7 (daily full-snapshot XLSX, idempotent), DA6 (no invoicing reconciliation, accounting owns it)

### Violations
- **Auto-detection engine:** DR10
- **GPS-stale chain:** DR17
- **Keeta appeals read-only:** DR16
- **Deliveroo unassigned auto-violation:** DD7
- **Americana supervisor override (no Appeal):** DA8

### Performance tiers
- **Generic (UTR + on-time):** DR11
- **Deliveroo-specific (acceptance + UTR):** DD10
- **Americana composite (orders + attendance + violations):** DA13

### Sidebar & IA
- **Global sidebar:** DS8
- **Analytics single tab:** DS10
- **Tenants tab:** DS9
- **Americana 10→5:** DA14
- **Deliveroo orders/cash split + schedule merge:** DD5, DD8
- **Phones/Vehicles → Driver 360 Assets:** DR12
- **Live Map dropped:** DS15
- **Tickets/Recruitment deferred:** DS16

### AI usage
- **v1 scope = OCR only:** DS3 (which downgrades DA5 contract OCR)
- **Cost meter + kill-switch:** DS4
- **Mobile OCR (Talabat/Deliveroo):** DR5, DD3, DD4
- **Anomaly detection, digests, contract OCR:** all v2 per DS3

### Money & accounting
- **No Darb invoicing:** DS11
- **Usage metering only:** DS3 (§S3 of PRD-SYSTEM)
- **Americana monthly XLSX export:** A8, DA6
- **Cash = COD per driver:** DR9, DD5

### Communications
- **No email:** DS12
- **No WhatsApp:** DS13 (kills `managerWhatsapp` field in DA2)
- **In-app notifications:** S12
- **English-only:** DS14

### Observability & retention
- **Sentry + pino:** DS18
- **Audit log + PII redaction:** DS19
- **Tiered retention:** DS20
- **7y financial + audit retention:** DS19, DS20

### Release & environments
- **Dev · Staging · Prod:** DS21
- **No feature flags:** DS17
- **v1 done definition:** DS22

---

## 7. Decisions that override prior decisions (change log)

When a later PRD corrected or tightened an earlier decision, the override is captured here explicitly so implementers don't follow stale guidance.

| Newer decision | Overrides | What changed | Implementer action |
|---|---|---|---|
| DS3 | DA5 | Contract PDF OCR downgraded from A2 (v1 P0) to v2. | PRD-AMERICANA.md A2 §"Contract OCR uploader" must be marked **v2**. Chain rates v1 = manual CRUD only. |
| DS8 | DR-era sidebar list (KPIs, Insights, Live Map, Tickets, Recruitment, Supervisors) | Global sidebar collapses to 7 entries (+ Tenants for SUPER_ADMIN). | `frontend/src/components/layout/Sidebar.tsx` — build the DS8 shape, not the DR open-items list. |
| DS9 | DR-era "Companies" tab | Renamed to **Tenants**, SUPER_ADMIN-only. | Route `/tenants`, not `/companies`. |
| DS10 | DR-era three-tab KPI/Analytics/Insights split | Collapsed to single **Analytics** tab with sub-sections. | Single page `/analytics` with tabs. |
| DS11 | Earlier implicit "Darb invoices tenants" assumption | Darb tracks usage only; external finance invoices. | Do not build invoice generation, payments, Stripe, etc. |
| DS12 | Any email-notification path (including CLAUDE.md gpsMonitorWorker notification body hints if interpreted as email) | All notifications in-app + push. Password reset ops-assisted. | Never wire transactional email in v1. Use SSE + Expo push. |
| DS13 | DA2 `AmericanaStore.managerWhatsapp` | Field removed. Click-to-chat WhatsApp references removed. | Schema and UI cleanup. |
| DS14 | CLAUDE.md "Arabic/English bilingual" | English-only v1; i18n scaffold stays. | `title`/`body` only; `titleAr`/`bodyAr` fields remain in schema but unused in v1. |
| DS15 | F7 (Keeta Operation Centre / Live Map) + DR-era global Live Map | Live Map dropped from core; tenant-opt-in only. | Do not route `/operation-centre` in default v1 build. |
| DS16 | DR-era Tickets + Recruitment tabs | Deferred to v2. | Remove from sidebar. |
| DS17 | Any inline feature-flag check added by default | No flag system in v1; `featureFlags.ts` as escape hatch only. | No `if (features.xyz)` gates; emergency kill via git commit. |

---

## 8. Open decisions (need ops input before code)

Pulled from every PRD's "Open items" section, deduplicated.

| Topic | Source PRD | What we need |
|---|---|---|
| Sample Americana XLSX | PRD-AMERICANA §8 | One real daily email attachment to lock the parser schema. |
| Active chain list | PRD-AMERICANA §8 | Enumerated list: KFC, Pizza Hut, Hardees, Krispy Kreme, etc. |
| Bike area whitelist | PRD-AMERICANA §8 | Which Kuwait areas are bike-valid (Salmiya, Hawally, Jabriya, …). |
| IMAP mailbox strategy | PRD-AMERICANA §8 | Per-tenant address vs. shared with tenant tag. |
| Target `targetPerDriverPerDay` | PRD-AMERICANA §8 | Car vs Bike defaults. |
| Monthly order tier targets | PRD-AMERICANA §8 | Gold/Silver/Bronze thresholds by vehicle. |
| Secrets manager | PRD-SYSTEM §8 | Doppler / 1Password Secrets / AWS Secrets Manager. |
| Log destination | PRD-SYSTEM §8 | Axiom vs Better Stack. |
| Hosting region | PRD-SYSTEM §8 | Vercel + Neon (closest) vs AWS Bahrain. |
| Default AI cap | PRD-SYSTEM §8 | Confirm $50/mo or adjust. |
| Permission matrix seed | PRD-SYSTEM §8 | Enumerate every route's permission key. |
| Overview matview refresh | PRD-SYSTEM §8 | Confirm 5-min interval. |
| Usage billing CSV schema | PRD-SYSTEM §8 | Align with finance on column set. |

---

## 9. What v1 explicitly does NOT ship

Consolidated from every PRD's "Out of scope" / "v2+" section.

**Product scope cut from v1:**
- Self-service tenant signup
- Invoice generation + payment collection
- Transactional email
- WhatsApp integration
- Full Arabic translation (scaffold only)
- Live Map (opt-in per tenant)
- Tickets module
- Recruitment module
- Historical data migration tooling
- Per-tenant white-label branding
- Feature-flag system
- Role-based landing pages (all roles start on Overview)

**AI features cut from v1 (all v2):**
- Anomaly detection
- Weekly / daily digest emails
- Contract-PDF OCR (Americana rates)
- AI exceptions narrative (Analytics → Insights)
- Replacement-sourcing AI suggestions

**Americana features cut from v1:**
- Fully-loaded driver cost model + margin column
- Drag-drop store-assignment board
- Replacement-sourcing tool
- Direct accounting connector (QuickBooks / Xero / Odoo / SAP)
- Per-contract rollup + renewal-risk scoring
- Per-store P&L page
- Regional / governorate / cost-center hierarchy
- Peer-store benchmarking
- Day-of-week seasonality model
- Low-volume-vs-peers violation
- Driver app check-in for Americana (HQ feed replaces it)

**Keeta features cut from v1 (or deferred by system decisions):**
- F7 Operation Centre live map → opt-in per tenant
- F12 Financial Management Darb-side invoicing → stays partner-side only
- Arabic/RTL polish → v2

**Deliveroo features cut from v1:**
- Per-order row OCR (v1 totals only)
- ICR/ICP advanced driver-app ingestion (future)

---

## 10. How to use this file

- **Implementers:** Before starting any PRD feature, search this file for the feature's ID (e.g., `A2`, `F7`, `D3`). Any `Supersedes` / `Overridden by` column must be honored.
- **Reviewers:** Use §7 (overrides) as the lint rule for code review — any v1 PR touching a superseded decision must cite the override.
- **Ops / PMs:** §8 lists everything blocking code; §9 is the "v2 backlog" you can reference in stakeholder updates.
- **New team members:** Read §1 (DS decisions) first — they govern everything. Then read the per-platform sections as you pick up tickets.

---

## 11. Document lineage

| File | Decisions introduced | Cumulative total |
|---|---|---|
| `CLAUDE.md` (baseline) | (implicit — tech stack, conventions) | — |
| `KEETA-PARITY-SPEC.md` | DK1–DK8 (decoded from features) | 8 |
| `PRD-RESTRUCTURE.md` | DR1–DR18 | 26 |
| `PRD-DELIVEROO.md` | DD1–DD10 | 36 |
| `PRD-AMERICANA.md` | DA1–DA14 | 50 |
| `PRD-SYSTEM.md` | DS1–DS22 | **72 total** |

**Next revision trigger:** First tenant pilot go-live (expected Week 6 per PRD-SYSTEM ladder) — revisit WhatsApp, email, Arabic, feature flags based on actual adoption signal.
