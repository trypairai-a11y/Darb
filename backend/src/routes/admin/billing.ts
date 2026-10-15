// Phase 2 Wave 4 — admin billing routes.
//
// REQ-pricing-model. Founder dashboard surface — view monthly bills across
// all tenants, drill into one tenant, and patch the per-tenant
// monthlyOverrideKd. Frontend lands in Wave 5.
//
// All endpoints mount `authMiddleware + requireSuperAdmin`. NOT tenantScope —
// admin routes operate ACROSS tenants by design.
//
// Endpoints (per UI-SPEC §8.4):
//   GET   /tenants                           — all tenants + totals
//   GET   /tenants/:tid                      — single tenant + history
//   PATCH /tenants/:tid/override             — sets monthlyOverrideKd + audit
//
// Audit trail (T-02-25): override changes write an AgentAction row via
// writeAgentAction. Per WARNING-7 the `proposer` is hardcoded "Darb"; the
// originator's identity is stamped into the `reasoning` prefix
// `Originated by super-admin user <name> (id: <userId>).`. Phase 8 ships
// the Operator proposer enum to remove this workaround.

import { Router, Request, Response } from "express";
import { prisma } from "../../config";
import { authMiddleware } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/superAdmin";
import { writeAgentAction } from "../../agent";
import { logger } from "../../config/logger";
import {
  computeMonthlyBill,
  listMonthlyBillsAcrossTenants,
  sumNetKd,
  type MonthlyBill,
} from "../../services/billing/billingService";

const router = Router();
router.use(authMiddleware, requireSuperAdmin);

// ─── Helpers ───────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  // Kuwait time (UTC+3), so the first three hours of the 1st are the new month.
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function originatorTag(req: Request): string {
  const u = req.user as { userId: string; name?: string; email?: string } | undefined;
  if (!u) return "Originated by super-admin user (unknown).";
  const label = u.name ?? u.email ?? "(unknown)";
  return `Originated by super-admin user ${label} (id: ${u.userId}).`;
}

function shiftYearMonth(yearMonth: string, monthsBack: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return yearMonth;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1; // 0..11
  const target = new Date(Date.UTC(year, monthIdx - monthsBack, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── GET /tenants — fleet-wide bill list ───────────────────────────────────

router.get("/tenants", async (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string | undefined) ?? currentYearMonth();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }

    const bills: MonthlyBill[] = await listMonthlyBillsAcrossTenants(month);

    const totals = {
      tenantCount: bills.length,
      mrrKd: sumNetKd(bills),
      activeCouriersAcrossFleets: bills.reduce(
        (acc, b) => acc + b.activeCouriers,
        0,
      ),
    };

    return res.json({
      month,
      tenants: bills.map((b) => ({
        tenantId: b.tenantId,
        tenantName: b.tenantName,
        activeCouriers: b.activeCouriers,
        computedKd: b.computedKd,
        override: b.override,
        netKd: b.netKd,
        designPartner: b.designPartner,
        trialEndsAt: b.trialEndsAt,
      })),
      totals,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.error?.({ err: msg }, "GET /admin/billing/tenants failed");
    return res.status(500).json({ error: msg });
  }
});

// ─── GET /tenants/:tid — single tenant + 6-month history ───────────────────

router.get("/tenants/:tenantId", async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const month = (req.query.month as string | undefined) ?? currentYearMonth();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }

    const bill = await computeMonthlyBill({ tenantId, yearMonth: month });

    // Pull the past 6 months. Each call shells back to computeMonthlyBill
    // so override-leakage protection is preserved per-month.
    const months = Array.from({ length: 6 }, (_, i) => shiftYearMonth(month, i));
    const past6Months = await Promise.all(
      months.map((m) => computeMonthlyBill({ tenantId, yearMonth: m })),
    );

    // Past invoices — read-only TaxInvoice rows for this tenant. Tenant-scoped.
    let pastInvoices: unknown[] = [];
    try {
      pastInvoices = await (prisma as unknown as {
        taxInvoice?: {
          findMany: (args: unknown) => Promise<unknown[]>;
        };
      }).taxInvoice?.findMany?.({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 24,
      }) ?? [];
    } catch {
      // taxInvoice delegate not mocked — leave empty.
    }

    return res.json({
      bill,
      past6Months,
      pastInvoices,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── PATCH /tenants/:tid/override — set monthlyOverrideKd + audit ──────────

router.patch(
  "/tenants/:tenantId/override",
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const { override, reason } = (req.body ?? {}) as {
        override?: number | null;
        reason?: string;
      };

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({
          error: "reason is required (audit-row-shape requirement)",
        });
      }
      if (override !== null && override !== undefined && (
        typeof override !== "number" ||
        !Number.isFinite(override) ||
        override < 0
      )) {
        return res.status(400).json({
          error: "override must be a non-negative number or null",
        });
      }

      // Read existing override for the audit "originalProposal".
      const existing = await (prisma as unknown as {
        tenant: {
          findFirst: (args: unknown) => Promise<{
            id: string;
            monthlyOverrideKd?: unknown;
          } | null>;
        };
      }).tenant.findFirst({
        where: { id: tenantId },
        select: { id: true, monthlyOverrideKd: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Coerce existing decimal to number for the audit row.
      let oldOverride: number | null = null;
      const ov = existing.monthlyOverrideKd;
      if (ov != null) {
        if (typeof ov === "number") oldOverride = ov;
        else if (typeof ov === "object" && typeof (ov as { toNumber?: () => number }).toNumber === "function") {
          oldOverride = (ov as { toNumber: () => number }).toNumber();
        } else {
          const n = Number(ov);
          oldOverride = Number.isFinite(n) ? n : null;
        }
      }

      await (prisma as unknown as {
        tenant: { update: (args: unknown) => Promise<{ id: string }> };
      }).tenant.update({
        where: { id: tenantId },
        data: { monthlyOverrideKd: override ?? null },
      });

      // T-02-25 audit row. WARNING-7 workaround per the wave plan.
      const userId = req.user!.userId;
      const audit = await writeAgentAction({
        tenantId,
        approverUserId: userId,
        toolName: "admin.billingOverride",
        originalProposal: { override: oldOverride },
        modificationsBeforeApproval: {
          override: override ?? null,
          reason,
        },
        outcome: "success",
        reasoning: `${originatorTag(req)} ${reason}`,
        subjectType: "Tenant",
        subjectId: tenantId,
      });

      return res.json({
        tenantId,
        override: override ?? null,
        previousOverride: oldOverride,
        auditId: audit.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

export default router;
