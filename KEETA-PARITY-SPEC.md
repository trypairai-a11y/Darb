# KEETA-PARITY-SPEC.md — Append to Darb

> **Purpose for Claude Code:** This spec extends `CLAUDE.md` with everything needed to bring the Darb Keeta module to parity with the real Keeta operations console (tenant `kt_HQ_Sidra`, Kuwait City), based on a 36-minute training recording from 14 April 2026.
>
> **How to use:** Implement features in the order listed. Each feature is self-contained with Prisma models, route signatures, file paths, UI requirements, and acceptance criteria. When a feature overlaps with one already defined in `CLAUDE.md`, extend the existing model/route rather than creating a duplicate.
>
> **Global conventions (reminder):** TypeScript strict • Prisma only • `authMiddleware + tenantScope` on every route • `getPagination() / paginatedResponse()` • Shadcn + Tailwind + Lucide • Arabic/English bilingual.

---

## 0. Implementation Order

| # | Feature | Priority | Depends on |
|---|---|---|---|
| F7  | Operation Centre — full-screen live map | P0 | existing LocationLog |
| F8  | Home KPI deltas (DoD / WoW) + trend toggle | P0 | KeetaDailyMetrics |
| F9  | Courier Details — 3-hour attendance slot grid | P0 | Driver, Shift |
| F10 | Shift Live Monitor — under-shift compliance | P0 | Shift, Notification (F4) |
| F11 | Partner Target Management (Incentive engine) | P1 | Driver, KeetaDailyMetrics |
| F12 | Financial Management (Billing, TaxInvoice, Withdrawal) | P1 | Tenant, Partner |
| F13 | Data Report — 3-tab trends | P2 | F8 |
| F14 | Pagination polish (page-jump, virtualization) | P2 | all tables |

Pre-existing CLAUDE.md features F1–F6 are untouched; this file adds F7–F14 and two **amendments** at the bottom.

---

## F7. Operation Centre — Full-Screen Live Map

**Goal:** Single-screen mission-control view showing every courier, merchant and active order on a Kuwait map with `By Order` / `By Courier` toggle.

### Backend — `backend/src/routes/keetaOperationCentre.ts`

```
GET /api/keeta/operation-centre/by-order
  → { orders: [{ id, status, merchantLat, merchantLng, customerLat, customerLng, courierId?, etaAt }] }

GET /api/keeta/operation-centre/by-courier
  → { couriers: [{ id, name, vehicle, lat, lng, status: 'working'|'idle'|'offline',
                    activeOrderId?, lastGpsAt, area }] }
```

Both endpoints are cached 5s (Redis) keyed by `tenantId`. Re-use `CourierOnlineSession` (F1) and `LocationLog` for coordinates.

### Frontend — `frontend/src/app/(dashboard)/keeta/operation-centre/page.tsx`

- Full-viewport React Leaflet map, Kuwait centered (`29.3759, 47.9774`, zoom 11).
- Top-left toggle: `By Order` / `By Courier` (keep state in URL query).
- Left-rail (collapsible) lists filterable entities; clicking one `flyTo`s and opens a popup.
- Courier pins colour-coded: green=working, amber=idle, grey=offline.
- Order pins: restaurant icon at merchant, flag at customer, dashed polyline when a courier is assigned.
- Refresh every 5s via SWR.

### Acceptance

- [ ] Toggle persists on reload.
- [ ] 200+ pins render <60 FPS (clustering required via `react-leaflet-cluster`).
- [ ] Works in RTL without flipping map chrome.

---

## F8. Home KPI Deltas + Trend Toggle

**Goal:** Upgrade `/keeta/overview` KPI cards to match Keeta's DoD / WoW deltas and add an accumulative / discrete trend-chart toggle.

### Backend — extend `backend/src/routes/keeta.ts`

Add to existing `GET /api/keeta/metrics/summary`:

```ts
// Return deltas computed server-side so the client stays dumb.
{
  acceptedTasks:     { value, dodPct, wowPct },
  deliveredTasks:    { value, dodPct, wowPct },
  deliveredProp:     { value, dodPct, wowPct },   // couriers-with-delivered / online-couriers
  cancelledTasks:    { value, dodPct, wowPct },
  onlineCouriers:    { value, dodPct, wowPct },
  onTimeRateDaily:   { value, dodPct, wowPct },
  trend: {
    mode: 'accumulative' | 'discrete',
    series: [{ date, acceptedTasks, deliveredTasks, onTimeRate }]
  }
}
```

DoD = `(today − yesterday) / yesterday`. WoW = `(today − sameWeekdayLastWeek) / sameWeekdayLastWeek`. Round to 2dp; render `+` / `−` and colour (green / red) in UI.

### Frontend — `frontend/src/components/keeta/CoreMetricsCards.tsx`

Six Shadcn `Card`s with: headline number, tiny `TrendPill` (DoD), second `TrendPill` (WoW) using `ArrowUp`/`ArrowDown` Lucide icons.

### Acceptance

- [ ] Deltas match the demo exactly for a seeded day (Accepted 493 / +4.01%).
- [ ] Trend toggle swaps the series without refetching.

---

## F9. Courier Details — 3-Hour Attendance Slot Grid

**Goal:** Replicate Keeta's per-courier-per-day table with 8× 3-hour attendance slots + task-volume columns.

### Prisma additions

```prisma
model CourierAttendanceSlot {
  id          String   @id @default(cuid())
  tenantId    String
  driverId    String
  date        DateTime @db.Date
  slotStart   Int      // 0, 3, 6, 9, 12, 15, 18, 21
  slotEnd     Int      // always slotStart + 3
  status      String   // "ON_SHIFT" | "NO_SHIFT" | "PARTIAL"
  onShiftMin  Int      @default(0)
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  driver      Driver   @relation(fields: [driverId], references: [id])

  @@unique([tenantId, driverId, date, slotStart])
  @@index([tenantId, date])
}

// Add to KeetaDailyMetrics (or create new if already taken):
model KeetaDailyMetrics {
  // ... existing fields ...
  validDay                Boolean @default(false) // counts toward Valid DA
  peakOnlineHours         Float   @default(0)
  tasksWithRestaurantArr  Int     @default(0)
  largeOrderTasksCompleted Int    @default(0)
}
```

### Backend — `backend/src/routes/keetaCourierDetails.ts`

```
GET /api/keeta/courier-details?mode=by-date|by-period&from&to&vehicleType&courierId
  → paginated rows with columns:
    onShift, validDay, courierAppOnlineTime, validOnlineTime, peakOnlineHours,
    acceptedTasks, tasksWithRestaurantArrivals, deliveredTasks,
    largeOrderTasksCompleted, cancelledTasks,
    slots: [{ start: '00:00', end: '03:00', label }, ...]
```

### Frontend — `frontend/src/app/(dashboard)/keeta/courier-details/page.tsx`

- Sticky filter bar: vehicle type chip-filter, courier ID search, date range, dimensions picker (Date / Courier / etc.).
- Table with **frozen left** (Courier + Vehicle columns) and **horizontally scrolling** metric + slot columns.
- Each slot cell: green `On Shift 3 hr` / grey `No Shift` / amber `2 hr 14 min` (partial).
- "Download Data" button triggers `/api/keeta/courier-details/export.xlsx` (ExcelJS) with yellow fill on `No Shift` cells.

### Acceptance

- [ ] Table renders 1,000 rows smoothly with virtualization (`@tanstack/react-virtual`).
- [ ] Exported XLSX preserves yellow highlights on No-shift rows.

---

## F10. Shift Live Monitor — Under-Shift Compliance

**Goal:** Keeta's Courier Schedule Live Monitor flags any courier whose scheduled shift <10 hours. Mirror that and push the flag into Notifications (F4).

### Prisma additions

```prisma
model ShiftComplianceConfig {
  tenantId          String  @id
  underShiftHours   Float   @default(10)
  evaluateCron      String  @default("0 6 * * *") // 06:00 Asia/Kuwait
  tenant            Tenant  @relation(fields: [tenantId], references: [id])
}
```

### Backend

- `backend/src/queues/shiftComplianceWorker.ts` — daily BullMQ job:
  1. For each tenant, load today's `Shift` rows grouped by driver.
  2. Compute `totalHours = sum(end - start)` per driver.
  3. If `totalHours < ShiftComplianceConfig.underShiftHours`, create `Notification` with `category='OPS_TODO'`, `severity='MEDIUM'`, `titleAr`/`bodyAr` populated.
- `GET /api/keeta/shift-monitor/rollup?date` →
  ```
  { perBranch: [{ branchId, totalRegistered, scheduled, notOnShift, scheduledGte10h }] }
  ```

### Frontend — `frontend/src/app/(dashboard)/keeta/shift-monitor/page.tsx`

- Rollup table per branch (columns above).
- Underneath: expandable list of `Couriers with scheduled shifts < 10 hours` (clickable → courier detail).

### Acceptance

- [ ] Cron-evaluated at 06:00 Asia/Kuwait; threshold configurable per tenant.
- [ ] Bell icon increments by the count created.

---

## F11. Partner Target Management (Incentive Engine)

**Goal:** Monthly target rounds per partner per vehicle type, with **two** parallel payout formulas: Experience Target (weighted formula) and Valid DA (count-based). A courier can earn **both** payments in the same period.

### Prisma additions

```prisma
enum VehicleType { CAR MOTORCYCLE }

model IncentiveTargetRound {
  id              String   @id @default(cuid())
  tenantId        String
  partnerId       String
  period          String   // "202604" (YYYYMM)
  vehicleType     VehicleType
  issuedAt        DateTime
  initialTarget   Int
  adjustedTarget  Int?
  status          String   @default("ACTIVE") // ACTIVE | CLOSED
  operator        String   // "Keeta OPS"
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  goals           IncentiveGoal[]
  tiers           IncentiveTier[]
  payouts         CourierIncentivePayout[]

  @@unique([tenantId, partnerId, period, vehicleType])
  @@index([tenantId, period])
}

model IncentiveGoal {
  id            String   @id @default(cuid())
  roundId       String
  name          String   // "ORDER_COMPLETION_PCT" | "ON_TIME_RATE"
  weight        Float    // 0.40, 0.60
  targetValue   Float    // e.g. 98.5 for On-time target
  minThreshold  Float    // 95 or 90 — below this, goal scores 0
  round         IncentiveTargetRound @relation(fields: [roundId], references: [id])
}

model IncentiveTier {
  id          String   @id @default(cuid())
  roundId     String
  kind        String   // "EXPERIENCE" | "VALID_DA"
  level       String   // "A" | "B" | "C" | "D"
  minRate     Float    // inclusive
  maxRate     Float    // exclusive (except top tier)
  payment     Int      // KWD integer
  round       IncentiveTargetRound @relation(fields: [roundId], references: [id])
}

model CourierIncentivePayout {
  id               String   @id @default(cuid())
  tenantId         String
  roundId          String
  driverId         String
  experienceRate   Float    // 0..200
  experienceTier   String?  // A|B|C|D|null
  experiencePayKwd Int      @default(0)
  validDaCount     Int      @default(0)
  validDaTier      String?
  validDaPayKwd    Int      @default(0)
  totalPayKwd      Int      @default(0)
  computedAt       DateTime @default(now())
  tenant           Tenant   @relation(fields: [tenantId], references: [id])
  driver           Driver   @relation(fields: [driverId], references: [id])
  round            IncentiveTargetRound @relation(fields: [roundId], references: [id])

  @@unique([roundId, driverId])
  @@index([tenantId, driverId])
}
```

### Default tier seed

```ts
// Experience Target (payments: 190/140/90/0 KWD)
const EXPERIENCE_TIERS = [
  { level: 'A', minRate: 100, maxRate: 200, payment: 190 },
  { level: 'B', minRate: 98,  maxRate: 100, payment: 140 },
  { level: 'C', minRate: 96,  maxRate: 98,  payment: 90  },
  { level: 'D', minRate: 0,   maxRate: 96,  payment: 0   },
];

// Valid DA (payments: 180/130/80/0 KWD, same for Car/Motorcycle by default)
const VALID_DA_TIERS = [
  { level: 'A', minRate: 40, maxRate: 52, payment: 180 },
  { level: 'B', minRate: 30, maxRate: 40, payment: 130 },
  { level: 'C', minRate: 25, maxRate: 30, payment: 80  },
  { level: 'D', minRate: 0,  maxRate: 25, payment: 0   },
];
```

### Business rules

**Experience Target Achievement Rate** =
```
Σ over goals:  min( (actual_metric / target_metric) × 100 × weight,  weight × 100 × CAP )
```
where:
- `ORDER_COMPLETION_PCT` — excludes non-delivery-related cancellations. Scores 0 if actual <95%.
- `ON_TIME_RATE` — target 98.5%. Scores 0 if actual <90%.
- `CAP = 2` (i.e. achievement rate caps at 200%).

**Valid DA Count** = number of days in the period where `KeetaDailyMetrics.validDay == true` (Valid Day means: On-Shift AND ValidOnlineTime ≥ configured min, AND DeliveredTasks ≥ configured min).

### Backend — `backend/src/routes/incentives.ts`

```
GET  /api/incentives/rounds?period&partnerId&vehicleType
GET  /api/incentives/rounds/:id
POST /api/incentives/rounds                          (Keeta OPS only)
PUT  /api/incentives/rounds/:id/adjust               (adjust target)
POST /api/incentives/rounds/:id/recompute            (recomputes all driver payouts)
GET  /api/incentives/rounds/:id/payouts              (paginated)
GET  /api/incentives/drivers/:driverId/performance   (per-courier performance tracking)
```

Recompute is also triggered nightly by a BullMQ worker for the active round.

### Frontend

- `frontend/src/app/(dashboard)/keeta/incentives/page.tsx` — Partner target management list (period, target round, issued target, adjusted target, status, operator).
- `frontend/src/app/(dashboard)/keeta/incentives/[id]/page.tsx` — Round detail with two panels:
  1. **Experience target calculation method** — shows the formula breakdown, Goal 1 and Goal 2 with weight/threshold/formula, plus the A/B/C/D tier table.
  2. **Valid DA assessment** — Car / Motorcycle tabs, tier table.
- `frontend/src/app/(dashboard)/keeta/incentives/[id]/payouts/page.tsx` — per-courier payout table (search by courier).
- `frontend/src/app/(dashboard)/keeta/drivers/[id]/performance/page.tsx` — timeline of rounds and earnings for a single courier.

### Acceptance

- [ ] Given the demo fixtures, recompute produces tier A payout of **190 KWD + 180 KWD = 370 KWD** for a courier hitting 102% experience and 42 Valid DA.
- [ ] Adjusting target updates `adjustedTarget` and leaves `initialTarget` intact (audit-safe).

---

## F12. Financial Management — Billing, Tax Invoice, Auto-Withdraw

**Goal:** Three-stage money flow observed in the recording: (1) Keeta issues a Billing each period; (2) partner uploads a Tax Invoice against that billing; (3) once accepted, a `PaymentWithdrawal` row is created as `SYSTEM AUTO WITHDRAW`.

### Prisma additions

```prisma
enum BillingStatus      { PENDING_INVOICE AWAITING_APPROVAL APPROVED PAID REJECTED }
enum TaxInvoiceStatus   { DRAFT SUBMITTED ACCEPTED REJECTED }
enum WithdrawalStatus   { PENDING WITHDRAWN FAILED }

model Billing {
  id            String         @id @default(cuid())
  tenantId      String
  partnerId     String
  groupId       String
  groupName     String
  billingId     String         @unique
  billType      String         // "MONTHLY_SETTLEMENT" | "ADJUSTMENT"
  period        String         // "202604"
  billingDate   DateTime
  invoiceAmount Decimal        @db.Decimal(18,3) // KWD supports 3dp
  payableAmount Decimal        @db.Decimal(18,3)
  status        BillingStatus  @default(PENDING_INVOICE)
  createdAt     DateTime       @default(now())
  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  taxInvoice    TaxInvoice?
  withdrawals   PaymentWithdrawal[]

  @@index([tenantId, period])
}

model TaxInvoice {
  id            String            @id @default(cuid())
  tenantId      String
  billingId     String            @unique
  invoiceNo     String
  issueDate     DateTime
  sellerName    String
  totalAmount   Decimal           @db.Decimal(18,3)
  fileUrl       String?           // uploaded PDF
  status        TaxInvoiceStatus  @default(DRAFT)
  rejectReason  String?
  submittedAt   DateTime?
  acceptedAt    DateTime?
  billing       Billing           @relation(fields: [billingId], references: [id])
  tenant        Tenant            @relation(fields: [tenantId], references: [id])
}

model PaymentWithdrawal {
  id             String            @id @default(cuid())
  tenantId       String
  billingId      String
  groupId        String
  groupName      String
  withdrawTime   DateTime
  tailNumber     String            // last 4 of IBAN, e.g. "8172"
  amountKwd      Decimal           @db.Decimal(18,3)
  status         WithdrawalStatus  @default(PENDING)
  operationStatus String           // "Withdrawn"
  note           String            @default("SYSTEM AUTO WITHDRAW")
  tenant         Tenant            @relation(fields: [tenantId], references: [id])
  billing        Billing           @relation(fields: [billingId], references: [id])

  @@index([tenantId, withdrawTime])
}
```

### Backend — `backend/src/routes/financial.ts`

```
GET  /api/financial/billings                 (filters: date, partner, group, status, period)
GET  /api/financial/billings/:id

GET  /api/financial/tax-invoices             (filters: date range, partner, status)
POST /api/financial/tax-invoices             (partner creates against a billing)
POST /api/financial/tax-invoices/:id/submit
POST /api/financial/tax-invoices/:id/accept  (Keeta OPS only → triggers withdrawal)
POST /api/financial/tax-invoices/:id/reject  { reason }

GET  /api/financial/withdrawals              (filters: date range, status)
```

### Auto-withdrawal worker

`backend/src/queues/autoWithdrawWorker.ts` (BullMQ, runs on `TaxInvoice.acceptedAt` event):

```ts
// On tax-invoice accept:
// 1. Mark Billing.status = APPROVED
// 2. Create PaymentWithdrawal { status: PENDING, amount = billing.payableAmount,
//      tailNumber from PartnerBankAccount, note: "SYSTEM AUTO WITHDRAW" }
// 3. Call payout provider (stub for now). On success → status=WITHDRAWN, operationStatus="Withdrawn"
// 4. Mark Billing.status = PAID
```

### Frontend

- `frontend/src/app/(dashboard)/keeta/financial/billings/page.tsx` — filterable table with monthly calendar popover (Jan–Dec grid for year selection, per demo).
- `frontend/src/app/(dashboard)/keeta/financial/tax-invoices/page.tsx` — Search + `Create Invoice` button; invoice detail drawer with PDF upload.
- `frontend/src/app/(dashboard)/keeta/financial/payments/page.tsx` — `SYSTEM AUTO WITHDRAW` ledger; columns: ID, Group ID, Group name, Withdraw Time, Tail Number, Amount (KWD, 3dp), Operation Status, Note.
- Header strip on Payments page: withdrawable balance, bank account, account name, **Account validation status: Verification Passed**.

### Acceptance

- [ ] Amounts render with 3 decimal places (KWD convention: `KWD 10,202.049`).
- [ ] Accepting a tax invoice generates exactly one withdrawal row.
- [ ] Rejected invoice surfaces the reject reason everywhere.

---

## F13. Data Report — 3-Tab Trends

**Goal:** `/keeta/reports` page with three tabs, each showing headline KPIs + a two-metric comparison trend chart.

### Backend — `backend/src/routes/keetaReports.ts`

```
GET /api/keeta/reports/task-volumes?from&to&groupBy=day|week
GET /api/keeta/reports/courier-capacity?from&to
GET /api/keeta/reports/delivery-experience?from&to
  → { cards: [{ label, value, dodPct, wowPct }], trend: { metricA, metricB, points: [...] } }
```

### Frontend — `frontend/src/app/(dashboard)/keeta/reports/page.tsx`

- Shadcn `Tabs`: Task Volumes / Courier Capacity / Delivery Experience.
- `MetricSelected` + `vsMetrics` dropdowns mirroring Keeta.
- Accumulative / Discrete toggle (same pattern as F8).
- Every table has a "Download Data" action (CSV + XLSX).

---

## F14. Pagination Polish

- Add `page-jump` input to `paginatedResponse` UI helpers (`Go to page ___ Jump`).
- Apply `@tanstack/react-virtual` to any table expected to render >200 rows (Courier Details, Shift Details, Incentive Payouts).

---

## Amendments to existing CLAUDE.md features

### Amendment A — Feature 4 (Notifications)

Add two new system notification kinds (Arabic + English bodies):

1. **Under-shift compliance** (from F10) — category `OPS_TODO`, severity `MEDIUM`.
2. **Tax invoice pending acceptance** (from F12) — category `IMPORTANT`, severity `MEDIUM`.

### Amendment B — Feature 6 (Shift / Area)

Promote **Delivery Area** from P3 to P1. Every Shift row in the Keeta console shows a required `Delivery Area` (Al Khiran, Hawally, Avenues, Salmiya, Jabriya, Kuwait City, Sabah Al-Salem…). Schema change:

```prisma
model Shift {
  // ... existing fields ...
  deliveryArea  String   // required now, not nullable
  @@index([tenantId, deliveryArea, startAt])
}
```

Seed the area dropdown from a new `DeliveryArea` enum table per tenant so ops can add areas without a migration.

---

## Design Tokens (Keeta visual parity)

```css
--keeta-sidebar-bg:     #0F1115;
--keeta-sidebar-active: #F9D923;   /* yellow accent */
--keeta-sidebar-text:   #E5E7EB;
--keeta-header-bg:      #1A1A2E;
--keeta-accent:         #D97706;   /* amber for partial / warnings */
--keeta-success:        #16A34A;
--keeta-danger:         #DC2626;
```

Use these only inside `/keeta/**` routes so the Talabat/Deliveroo/Americana modules keep their existing palettes.

---

## Test Fixtures

Add to `backend/prisma/seed.ts`:

- 1 tenant `kt_HQ_Sidra` (Sidra company for consumer order deliver, Kuwait City).
- 1 partner `Sidra Co.` with `PartnerBankAccount { tailNumber: "8172", name: "Kuwait Finance House" }`.
- 7 monthly `IncentiveTargetRound` rows (202510–202604) with default tiers seeded.
- 7 historical `PaymentWithdrawal` rows (amounts from the demo: 10,202.049 → 930.536 KWD).
- 20 seed `Driver` rows (mix of `MOTORCYCLE` and `PRIVATE_CAR`) with 14 days of `KeetaDailyMetrics` and `CourierAttendanceSlot` rows.

These fixtures let the demo-day dashboard match the numbers in the training recording (Accepted 493, Delivered 425, On-time 99.06%).

---

## Appendix — Demo-day values (for golden tests)

| Metric | Value | DoD | WoW |
|---|---|---|---|
| Accepted Tasks | 493 | +4.01% | — |
| Delivered Tasks | 425 | −0.47% | +14.02% |
| Couriers (Delivered) Proportion | 93.98% | −1.27% | +5.00% |
| Cancelled Tasks | 50 | +6.38% | +100.00% |
| Online Couriers | 79 | −3.66% | +1.28% |
| On-time Rate (D) | 99.06% | +0.05% | +0.77% |

Golden-test file: `backend/src/tests/keeta/demoDay.spec.ts`.
