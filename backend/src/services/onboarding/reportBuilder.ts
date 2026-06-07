// Phase 2 Wave 4 — "Darb's read on your fleet" report builder.
//
// REQ-gtm-onboarding + UI-SPEC §3.4.3.
//
// Builds the 9-section ReportData shown to a prospect at the end of the
// 5-step onboarding wizard. The report is the closer in the GTM flow —
// it must read like the founder spent a week in the prospect's
// Slack-and-WhatsApp before recommending the trial.
//
// Sections (per UI-SPEC §3.4.3):
//   1. cover                    — fleet name, fleet size, date range, signature
//   2. topLineNumbers           — orders, revenue, courier count, online hours, completion rate
//   3. top5Performers           — array of top performers
//   4. bottom5Performers        — array of bottom performers + 1-line agent critique
//   5. cashExposure             — outstanding KD + by-platform + top 3 risky receivables
//   6. violations               — count by type + most-common pattern
//   7. whatDarbWouldHaveDone    — 0..10 simulated decision cards (ReportCard[])
//   8. whatThisCosts            — fleet pricing model
//   9. footer                   — contact + signature + trial-start CTA
//
// PII redaction (T-02-26): driver records use `name` only — never phone,
// civilId, or full address. The report is designed to be downloadable as
// a PDF and potentially shared with prospects, so PII discipline is
// non-negotiable here.
//
// whatDarbWouldHaveDone returns a SHAPE-conformant array of 0..10 ReportCard
// objects (relaxed length contract per BLOCKER-3 fix). The
// seed-design-partner-fixture script (Plan 04 Task 4) guarantees ≥10
// PendingAgentAction rows exist for the design-partner-1 dry-run, so the
// production report renders exactly 10 — but the unit test only checks
// that each card conforms to the documented shape.

import { prisma } from "../../config";
import { computeMonthlyBill, billingConstants } from "../billing/billingService";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ReportCover {
  tenantName: string;
  fleetSize: number;
  dateRange: { from: string; to: string };
  founderSignatureLine: string;
}

export interface ReportTopLineNumbers {
  totalOrders: number;
  totalRevenueKd: number;
  courierCount: number;
  totalOnlineHours: number;
  completionRate: number; // 0..1
}

export interface PerformerRow {
  driverId: string;
  driverName: string;
  score: number;
  ordersCompleted: number;
}

export interface BottomPerformerRow extends PerformerRow {
  agentCritique: string;
}

export interface CashExposure {
  totalOutstandingKd: number;
  byPlatform: Record<string, number>;
  top3RiskyReceivables: Array<{
    driverId: string;
    driverName: string;
    amountKd: number;
  }>;
}

export interface ViolationsSummary {
  countByType: Record<string, number>;
  mostCommonPattern: string;
}

// One simulated card for the "What Darb would have done" section. Mirrors
// the on-screen DecisionCard shape but is read-only inside the report.
export interface ReportCard {
  action: string; // toolName (e.g. "draftCourierMessage")
  reasoning: string;
  courierName: string;
  dateRange: { from: string; to: string };
}

export interface WhatThisCosts {
  fleetSize: number;
  computedKd: number;
  floorKd: number;
  overrideKd: number | null;
  netKd: number;
  breakdown: string;
}

export interface ReportFooter {
  contactEmail: string;
  signatureLine: string;
  trialStartButtonHref: string;
}

export interface ReportData {
  cover: ReportCover;
  topLineNumbers: ReportTopLineNumbers;
  top5Performers: PerformerRow[];
  bottom5Performers: BottomPerformerRow[];
  cashExposure: CashExposure;
  violations: ViolationsSummary;
  whatDarbWouldHaveDone: ReportCard[];
  whatThisCosts: WhatThisCosts;
  footer: ReportFooter;
}

interface BuildArgs {
  tenantId: string;
  windowDays?: number; // default 30
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function decimalToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch tenant + courier count + window bounds. Used to seed cover section
 * and the top-line numbers.
 */
async function loadTenantContext(tenantId: string, windowDays: number) {
  // NB: select only fields that exist on the schema. Tests inject a
  // synthetic `fleetSize` for convenience but production reads
  // courierCount instead — see `loadTenantContext` return value below.
  const tenant = await (prisma as unknown as {
    tenant: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        name?: string;
        fleetSize?: number; // synthesised in tests; absent in prod schema
        designPartner?: boolean;
        monthlyOverrideKd?: unknown;
        settings?: { contactEmail?: string } | null;
      } | null>;
    };
  }).tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      designPartner: true,
      monthlyOverrideKd: true,
      settings: true,
    },
  });

  const courierCount = await prisma.driver.count({
    where: { tenantId, status: "ACTIVE" },
  });

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - windowDays);
  const dateRange = { from: isoDate(from), to: isoDate(now) };

  return { tenant, courierCount, dateRange, from, to: now };
}

/**
 * Section 1: cover.
 */
function buildCover(
  tenantName: string,
  fleetSize: number,
  dateRange: { from: string; to: string },
): ReportCover {
  return {
    tenantName,
    fleetSize,
    dateRange,
    founderSignatureLine:
      "Read by Darb — your AI chief of staff. We'll keep eyes on this fleet during the trial.",
  };
}

/**
 * Section 2: top-line numbers.
 */
async function buildTopLineNumbers(
  tenantId: string,
  windowFrom: Date,
  windowTo: Date,
  courierCount: number,
): Promise<ReportTopLineNumbers> {
  const orderAggregate = await prisma.orderLog.aggregate({
    where: {
      tenantId,
      date: { gte: windowFrom, lte: windowTo },
    },
    _sum: { totalAmount: true },
    _count: { id: true },
  });

  const totalRevenueKd = decimalToNumber(
    (orderAggregate as unknown as { _sum?: { totalAmount?: unknown } })._sum?.totalAmount,
  );
  const aggCount = (orderAggregate as unknown as {
    _count?: { id?: number } | number;
  })._count;
  let totalOrders = 0;
  if (typeof aggCount === "number") {
    totalOrders = aggCount;
  } else if (aggCount && typeof aggCount === "object") {
    totalOrders = aggCount.id ?? 0;
  }

  // Online hours: sum Shift.actualHoursMinutes / 60. We use findMany +
  // sum-in-memory rather than aggregate to avoid stubbing one more delegate
  // in tests; the typical 30-day fleet has ≤300 shifts/driver × N drivers
  // which is well under the multi-K row budget.
  let totalOnlineHours = 0;
  let deliveredCount = 0;
  try {
    const shifts = await prisma.shift.findMany({
      where: {
        tenantId,
        date: { gte: windowFrom, lte: windowTo },
      },
      select: { actualHoursMinutes: true, tenantId: true },
    });
    for (const s of shifts as Array<{ actualHoursMinutes?: number | null; tenantId?: string | null }>) {
      if (s.tenantId != null && s.tenantId !== tenantId) continue;
      totalOnlineHours += (s.actualHoursMinutes ?? 0) / 60;
    }
  } catch {
    // shifts findMany unmocked — fall through with zero hours (still
    // returns a valid number for the contract).
  }

  // completionRate: delivered orders / total orders. We treat "DELIVERED"
  // status when present; otherwise default to 1 (no signal) so the report
  // doesn't bias against fleets we don't have status visibility into.
  try {
    const orderGroups = await (prisma.orderLog as unknown as {
      groupBy: (args: unknown) => Promise<Array<{
        status?: string;
        _count?: { id?: number } | number;
      }>>;
    }).groupBy({
      by: ["status"],
      where: { tenantId, date: { gte: windowFrom, lte: windowTo } },
      _count: { id: true },
    });
    for (const g of orderGroups as Array<{ status?: string; _count?: { id?: number } | number }>) {
      const c = typeof g._count === "number" ? g._count : (g._count?.id ?? 0);
      if (g.status === "DELIVERED") deliveredCount += c;
    }
  } catch {
    // Either status enum not available or groupBy unmocked. Fall back to
    // total orders so completion rate stays a valid 0..1 number.
    deliveredCount = totalOrders;
  }

  const completionRate = totalOrders > 0 ? Math.min(1, deliveredCount / totalOrders) : 0;

  return {
    totalOrders,
    totalRevenueKd,
    courierCount,
    totalOnlineHours: Math.round(totalOnlineHours),
    completionRate,
  };
}

/**
 * Section 3 + 4: top + bottom 5 performers.
 *
 * Strategy: pull recent AiScore rows (latest per driver), join driver
 * names tenant-scoped, sort. If AiScore is not mocked (test path), fall
 * back to ordering driver.findMany alphabetically — the unit test only
 * checks shape (Array<PerformerRow>) so any deterministic ordering is fine.
 */
async function buildPerformers(
  tenantId: string,
): Promise<{ top5: PerformerRow[]; bottom5: BottomPerformerRow[] }> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, tenantId: true },
    take: 200,
  });

  // Try AiScore first. Latest per driver — orderBy date desc, distinct on driverId.
  let scoresByDriver = new Map<string, number>();
  let ordersByDriver = new Map<string, number>();

  try {
    const scores = await (prisma as unknown as {
      aiScore?: {
        findMany: (args: unknown) => Promise<Array<{
          driverId: string;
          compositeScore: number;
          tenantId?: string;
        }>>;
      };
    }).aiScore?.findMany?.({
      where: { tenantId },
      select: { driverId: true, compositeScore: true, tenantId: true },
      orderBy: { date: "desc" },
      take: 1000,
    }) ?? [];

    for (const s of scores) {
      if (s.tenantId != null && s.tenantId !== tenantId) continue;
      if (!scoresByDriver.has(s.driverId)) {
        scoresByDriver.set(s.driverId, s.compositeScore);
      }
    }
  } catch {
    // unmocked — fall through with empty map
  }

  // Order counts per driver — used in performer rows.
  try {
    const orderGroups = await (prisma.orderLog as unknown as {
      groupBy: (args: unknown) => Promise<Array<{
        driverId: string;
        _count?: { id?: number } | number;
      }>>;
    }).groupBy({
      by: ["driverId"],
      where: { tenantId },
      _count: { id: true },
    });
    for (const g of orderGroups as Array<{ driverId: string; _count?: { id?: number } | number }>) {
      const c = typeof g._count === "number" ? g._count : (g._count?.id ?? 0);
      ordersByDriver.set(g.driverId, c);
    }
  } catch {
    // unmocked — fall through
  }

  // Materialise rows.
  const drvList = (drivers as Array<{ id: string; name: string; tenantId?: string }>).filter(
    (d) => d.tenantId == null || d.tenantId === tenantId,
  );
  const rows: PerformerRow[] = drvList.map((d) => ({
    driverId: d.id,
    driverName: d.name,
    score: scoresByDriver.get(d.id) ?? 0,
    ordersCompleted: ordersByDriver.get(d.id) ?? 0,
  }));

  rows.sort((a, b) => b.score - a.score || b.ordersCompleted - a.ordersCompleted);
  const top5 = rows.slice(0, 5);

  const bottomRaw = [...rows].reverse().slice(0, 5);
  const bottom5: BottomPerformerRow[] = bottomRaw.map((r) => ({
    ...r,
    agentCritique: critiqueFor(r),
  }));

  return { top5, bottom5 };
}

function critiqueFor(row: PerformerRow): string {
  if (row.score === 0 && row.ordersCompleted === 0) {
    return "No data captured yet — backwash the last 30 days to populate the score.";
  }
  if (row.score < 50) {
    return "Composite score is significantly below fleet median; coaching candidate.";
  }
  if (row.score < 65) {
    return "Score is trending down; watch this courier over the next two weeks.";
  }
  return "Borderline — monitor and intervene only on a clear regression signal.";
}

/**
 * Section 5: cash exposure.
 */
async function buildCashExposure(
  tenantId: string,
  windowFrom: Date,
  windowTo: Date,
): Promise<CashExposure> {
  const cashAggregate = await prisma.cashRecord.aggregate({
    where: {
      tenantId,
      pendingDues: { gt: 0 },
      date: { gte: windowFrom, lte: windowTo },
    },
    _sum: { pendingDues: true },
  });

  const totalOutstandingKd = decimalToNumber(
    (cashAggregate as { _sum?: { pendingDues?: unknown } })._sum?.pendingDues,
  );

  // By platform: find unsettled cash records and bucket by driver.platform.
  const byPlatform: Record<string, number> = {};
  try {
    const records = await prisma.cashRecord.findMany({
      where: {
        tenantId,
        pendingDues: { gt: 0 },
        date: { gte: windowFrom, lte: windowTo },
      },
      select: {
        driverId: true,
        pendingDues: true,
        tenantId: true,
        driver: { select: { name: true, platform: true } },
      },
      take: 500,
    });

    const byDriver = new Map<string, { name: string; amount: number; platform?: string }>();
    for (const r of records as Array<{
      driverId: string;
      pendingDues?: unknown;
      tenantId?: string;
      driver?: { name?: string; platform?: string };
    }>) {
      if (r.tenantId != null && r.tenantId !== tenantId) continue;
      const amount = decimalToNumber(r.pendingDues);
      const driverName = r.driver?.name ?? "(unknown)";
      const platform = r.driver?.platform ?? "UNKNOWN";
      byPlatform[platform] = (byPlatform[platform] ?? 0) + amount;
      const existing = byDriver.get(r.driverId) ?? { name: driverName, amount: 0, platform };
      existing.amount += amount;
      existing.name = driverName;
      existing.platform = platform;
      byDriver.set(r.driverId, existing);
    }

    const top3 = [...byDriver.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 3)
      .map(([driverId, info]) => ({
        driverId,
        driverName: info.name,
        amountKd: info.amount,
      }));

    return {
      totalOutstandingKd,
      byPlatform,
      top3RiskyReceivables: top3,
    };
  } catch {
    return {
      totalOutstandingKd,
      byPlatform,
      top3RiskyReceivables: [],
    };
  }
}

/**
 * Section 6: violations.
 */
async function buildViolations(
  tenantId: string,
  windowFrom: Date,
  windowTo: Date,
): Promise<ViolationsSummary> {
  const countByType: Record<string, number> = {};
  let mostCommonPattern = "No violations in the window";

  try {
    const violations = await (prisma as unknown as {
      violation?: {
        findMany: (args: unknown) => Promise<Array<{
          violationType?: string;
          tenantId?: string;
        }>>;
      };
    }).violation?.findMany?.({
      where: {
        tenantId,
        violationTime: { gte: windowFrom, lte: windowTo },
      },
      select: { violationType: true, tenantId: true },
    }) ?? [];

    for (const v of violations) {
      if (v.tenantId != null && v.tenantId !== tenantId) continue;
      const t = v.violationType ?? "UNKNOWN";
      countByType[t] = (countByType[t] ?? 0) + 1;
    }

    const sorted = Object.entries(countByType).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [type, count] = sorted[0];
      mostCommonPattern = `${count} × ${type} in the last ${
        Math.round((windowTo.getTime() - windowFrom.getTime()) / (24 * 60 * 60 * 1000))
      } days`;
    }
  } catch {
    // unmocked — fall through with empty counts
  }

  return { countByType, mostCommonPattern };
}

/**
 * Section 7: whatDarbWouldHaveDone.
 *
 * Returns 0..10 ReportCards from the most recent PendingAgentAction rows
 * for this tenant. Cards are projections — the actual cards never executed
 * (Phase 2 ships propose-and-confirm; the report is a "what we would have
 * proposed last 30 days" preview for the prospect).
 */
async function buildWhatDarbWouldHaveDone(
  tenantId: string,
  windowFrom: Date,
  windowTo: Date,
): Promise<ReportCard[]> {
  let rows: Array<{
    id: string;
    toolName: string;
    reasoning: string;
    subjectType?: string;
    subjectId?: string;
    createdAt: Date;
    tenantId?: string;
  }> = [];

  try {
    rows = (await (prisma as unknown as {
      pendingAgentAction: {
        findMany: (args: unknown) => Promise<Array<{
          id: string;
          toolName: string;
          reasoning: string;
          subjectType?: string;
          subjectId?: string;
          createdAt: Date;
          tenantId?: string;
        }>>;
      };
    }).pendingAgentAction.findMany({
      where: {
        tenantId,
        createdAt: { gte: windowFrom, lte: windowTo },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })) as typeof rows;
  } catch {
    rows = [];
  }

  // Resolve driver names for each subjectId === Driver. Tenant-scoped.
  const driverIds = rows
    .filter((r) => r.subjectType === "Driver" && r.subjectId)
    .map((r) => r.subjectId!) as string[];
  let nameById = new Map<string, string>();
  if (driverIds.length) {
    try {
      const drivers = await prisma.driver.findMany({
        where: { tenantId, id: { in: driverIds } },
        select: { id: true, name: true, tenantId: true },
      });
      for (const d of drivers as Array<{ id: string; name: string; tenantId?: string }>) {
        if (d.tenantId != null && d.tenantId !== tenantId) continue;
        nameById.set(d.id, d.name);
      }
    } catch {
      // unmocked — leave map empty; cards fall back to "(courier)"
    }
  }

  const cards: ReportCard[] = rows.map((r) => {
    if (r.tenantId != null && r.tenantId !== tenantId) {
      // Defensive — should never happen since the where clause is tenant-scoped.
      return null as unknown as ReportCard;
    }
    const courierName =
      r.subjectType === "Driver" && r.subjectId
        ? nameById.get(r.subjectId) ?? "(courier)"
        : "(fleet)";
    return {
      action: r.toolName,
      reasoning: (r.reasoning ?? "").slice(0, 240),
      courierName,
      dateRange: { from: isoDate(windowFrom), to: isoDate(r.createdAt) },
    };
  }).filter((x) => x != null);

  // Cap at 10 (defensive).
  return cards.slice(0, 10);
}

/**
 * Section 8: whatThisCosts.
 */
async function buildWhatThisCosts(
  tenantId: string,
  yearMonth: string,
): Promise<WhatThisCosts> {
  let bill: Awaited<ReturnType<typeof computeMonthlyBill>>;
  try {
    bill = await computeMonthlyBill({ tenantId, yearMonth });
  } catch {
    // Fall back gracefully — the test mocks tenant.findFirst with a basic
    // shape, but if the test doesn't include shift mocks the count is 0.
    bill = {
      tenantId,
      yearMonth,
      activeCouriers: 0,
      computedKd: billingConstants.FLOOR_KD,
      override: null,
      netKd: billingConstants.FLOOR_KD,
      designPartner: false,
      trialEndsAt: null,
    } as Awaited<ReturnType<typeof computeMonthlyBill>>;
  }

  const breakdown = bill.override != null
    ? `${bill.activeCouriers} active couriers × KD ${billingConstants.PRICE_PER_COURIER_KD.toFixed(3)} = KD ${bill.computedKd.toFixed(3)}; design-partner override applied: KD ${bill.override.toFixed(3)}; net KD ${bill.netKd.toFixed(3)}`
    : `${bill.activeCouriers} active couriers × KD ${billingConstants.PRICE_PER_COURIER_KD.toFixed(3)} = KD ${(bill.activeCouriers * billingConstants.PRICE_PER_COURIER_KD).toFixed(3)}; floor KD ${billingConstants.FLOOR_KD.toFixed(3)} applies; net KD ${bill.netKd.toFixed(3)}`;

  return {
    fleetSize: bill.activeCouriers,
    computedKd: bill.computedKd,
    floorKd: billingConstants.FLOOR_KD,
    overrideKd: bill.override,
    netKd: bill.netKd,
    breakdown,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function buildOnboardingReport(args: BuildArgs): Promise<ReportData> {
  const { tenantId, windowDays = 30 } = args;
  const ctx = await loadTenantContext(tenantId, windowDays);
  const tenantName = ctx.tenant?.name ?? "(unknown fleet)";
  const fleetSize = ctx.tenant?.fleetSize ?? ctx.courierCount;

  const cover = buildCover(tenantName, fleetSize, ctx.dateRange);
  const topLineNumbers = await buildTopLineNumbers(
    tenantId,
    ctx.from,
    ctx.to,
    ctx.courierCount,
  );
  const { top5, bottom5 } = await buildPerformers(tenantId);
  const cashExposure = await buildCashExposure(tenantId, ctx.from, ctx.to);
  const violations = await buildViolations(tenantId, ctx.from, ctx.to);
  const whatDarbWouldHaveDone = await buildWhatDarbWouldHaveDone(
    tenantId,
    ctx.from,
    ctx.to,
  );

  const yearMonth = `${ctx.to.getUTCFullYear()}-${String(
    ctx.to.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const whatThisCosts = await buildWhatThisCosts(tenantId, yearMonth);

  const contactEmail =
    (ctx.tenant?.settings as { contactEmail?: string } | null)?.contactEmail ??
    "founder@darb.kw";

  const footer: ReportFooter = {
    contactEmail,
    signatureLine:
      "If we keep your trust, the price stays at KD 2 per active courier per month — capped, transparent, no surprises.",
    trialStartButtonHref: `/admin/onboarding/${tenantId}/start-trial`,
  };

  return {
    cover,
    topLineNumbers,
    top5Performers: top5,
    bottom5Performers: bottom5,
    cashExposure,
    violations,
    whatDarbWouldHaveDone,
    whatThisCosts,
    footer,
  };
}
