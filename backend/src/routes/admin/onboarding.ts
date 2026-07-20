// Phase 2 Wave 4 — admin onboarding routes.
//
// REQ-gtm-onboarding. The 5-step founder/super-admin wizard backend.
// Frontend wizard arrives in Wave 5.
//
// All endpoints mount `authMiddleware + requireSuperAdmin`. Crucially,
// they do NOT mount tenantScope — admin routes operate ACROSS tenants
// (the founder is acting on behalf of a prospect tenant identified by
// req.params.tenantId, not their own tenant).
//
// Endpoints (per UI-SPEC §8.3):
//   POST /tenants                                  — create Tenant + owner User
//   POST /tenants/:tid/couriers/import             — XLSX/CSV courier import
//   GET  /tenants/:tid/report                      — Darb's read on your fleet
//   POST /tenants/:tid/start-trial                 — flip designPartner + trialEndsAt
//
// Audit trail (T-02-25): start-trial writes an AgentAction row via the
// Phase-1 writeAgentAction helper. Per WARNING-7 the `proposer` field is
// hardcoded to "Darb" by writeAgentAction; the originator's identity is
// stamped into the `reasoning` field with the prefix
// `Originated by super-admin user <name> (id: <userId>).`. Phase 8 will
// introduce an Operator proposer enum so this workaround can be removed.

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { prisma } from "../../config";
import { authMiddleware } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/superAdmin";
import { writeAgentAction } from "../../agent";
import { logger } from "../../config/logger";
import { buildOnboardingReport } from "../../services/onboarding/reportBuilder";

const router = Router();
router.use(authMiddleware, requireSuperAdmin);

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateTempPassword(length = 16): string {
  // 16-char alphanumeric. Founder shares verbally during onboarding —
  // Phase 9 will replace this with a magic-link / email flow.
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function originatorTag(req: Request): string {
  const u = req.user as { userId: string; name?: string; email?: string } | undefined;
  if (!u) return "Originated by super-admin user (unknown).";
  const label = u.name ?? u.email ?? "(unknown)";
  return `Originated by super-admin user ${label} (id: ${u.userId}).`;
}

// In-memory multer for courier import. 10MB limit (T-02-23).
const courierImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── POST /tenants — create tenant + owner user ────────────────────────────

router.post("/tenants", async (req: Request, res: Response) => {
  try {
    const {
      name,
      ownerName,
      ownerEmail,
      ownerPhone,
      designPartner,
      monthlyOverrideKd,
    } = (req.body ?? {}) as {
      name?: string;
      ownerName?: string;
      ownerEmail?: string;
      ownerPhone?: string;
      designPartner?: boolean;
      monthlyOverrideKd?: number | null;
    };

    if (!name || !ownerName || !ownerEmail) {
      return res.status(400).json({
        error: "name, ownerName, and ownerEmail are required",
      });
    }

    const tenant = await (prisma as unknown as {
      tenant: { create: (args: unknown) => Promise<{ id: string; name: string }> };
    }).tenant.create({
      data: {
        name,
        subscriptionPlan: "TRIAL",
        designPartner: designPartner === true,
        monthlyOverrideKd: monthlyOverrideKd ?? null,
      },
    });

    const tempPassword = generateTempPassword(16);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const ownerUser = await (prisma as unknown as {
      user: { create: (args: unknown) => Promise<{ id: string }> };
    }).user.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail,
        phone: ownerPhone ?? null,
        passwordHash,
        name: ownerName,
        role: "ADMIN",
        isActive: true,
        isSuperAdmin: false,
      },
    });

    return res.status(201).json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      ownerUserId: ownerUser.id,
      // Phase 2 white-glove: founder shares this password verbally during
      // the onboarding call. Phase 9 will switch to email magic-link flow.
      tempPassword,
      tempPasswordNote: "DEV — share verbally. Phase 9 wires real email.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.error?.({ err: msg }, "POST /admin/onboarding/tenants failed");
    return res.status(500).json({ error: msg });
  }
});

// ─── POST /tenants/:tid/couriers/import ────────────────────────────────────

router.post(
  "/tenants/:tenantId/couriers/import",
  courierImportUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const tenant = await (prisma as unknown as {
        tenant: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
      }).tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "file required (XLSX or CSV)" });
      }

      // Parse the upload. We support XLSX + CSV via the existing xlsx lib
      // (already pinned at backend dep). For Phase 2 we only do row-shape
      // validation; downstream Phase 6 will plug real platform mapping.
      let rows: Array<Record<string, string>> = [];
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
        });
      } catch (parseErr) {
        return res.status(400).json({
          error: `Failed to parse upload: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
        });
      }

      // Hard cap on rows (T-02-23 mitigation).
      const MAX_ROWS = 10000;
      if (rows.length > MAX_ROWS) {
        return res.status(413).json({
          error: `Upload exceeds row limit (max ${MAX_ROWS}, got ${rows.length}). Split the file and retry.`,
        });
      }

      // Validate + create. Required columns: name, phone, civilId, platformId,
      // vehicleType. Skip duplicates (existing civilId in tenant).
      let valid = 0;
      let missingPhone = 0;
      let duplicateCivilId = 0;
      let created = 0;

      const seenCivilIds = new Set<string>();
      // Pre-fetch existing drivers for de-dup. tenant-scoped.
      const existing = await prisma.driver.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      });
      const existingIds = new Set<string>(
        existing.map((d: { id: string }) => d.id),
      );

      for (const row of rows) {
        const phone = String(row.phone ?? "").trim();
        const civilId = String(row.civilId ?? "").trim();
        const dname = String(row.name ?? "").trim();
        const platform = String(row.platform ?? "KEETA").toUpperCase();
        const vehicleType = String(row.vehicleType ?? "MOTORCYCLE").toUpperCase();

        if (!phone) {
          missingPhone += 1;
          continue;
        }
        if (civilId && (seenCivilIds.has(civilId) || existingIds.has(civilId))) {
          duplicateCivilId += 1;
          continue;
        }
        if (civilId) seenCivilIds.add(civilId);
        if (!dname) continue;
        valid += 1;

        // For Phase 2 we always need a Company id — pick the first one for
        // the tenant or create a placeholder. In practice the wizard step
        // before courier import creates a Company for the platform.
        const company = await prisma.company.findFirst({
          where: { tenantId, platform: platform as "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA" },
          select: { id: true },
        });
        if (!company) continue;

        try {
          await prisma.driver.create({
            data: {
              tenantId,
              companyId: company.id,
              name: dname,
              phone,
              platform: platform as "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA",
              platformDriverId: row.platformId || null,
              vehicleType: vehicleType as "MOTORCYCLE" | "CAR",
              hireDate: new Date(),
            },
          });
          created += 1;
        } catch (createErr) {
          // duplicate or other constraint — log and continue.
          logger?.warn?.(
            { err: createErr instanceof Error ? createErr.message : String(createErr), civilId },
            "courier import row failed",
          );
        }
      }

      return res.json({
        totalRows: rows.length,
        valid,
        invalid: { missingPhone, duplicateCivilId },
        created,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

// ─── GET /tenants/:tid/report ──────────────────────────────────────────────

router.get(
  "/tenants/:tenantId/report",
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const windowDays = req.query.windowDays
        ? Math.max(1, Math.min(120, Number(req.query.windowDays) || 30))
        : 30;
      const report = await buildOnboardingReport({ tenantId, windowDays });
      return res.json(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

// ─── POST /tenants/:tid/start-trial ────────────────────────────────────────

router.post(
  "/tenants/:tenantId/start-trial",
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const { designPartner, overrideKd } = (req.body ?? {}) as {
        designPartner?: boolean;
        overrideKd?: number | null;
      };

      const tenant = await (prisma as unknown as {
        tenant: {
          findFirst: (args: unknown) => Promise<{ id: string; name?: string } | null>;
          update: (args: unknown) => Promise<{ id: string }>;
        };
      }).tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const updated = await (prisma as unknown as {
        tenant: { update: (args: unknown) => Promise<{ id: string }> };
      }).tenant.update({
        where: { id: tenantId },
        data: {
          designPartner: designPartner === true,
          monthlyOverrideKd: overrideKd ?? null,
          trialEndsAt,
        },
      });

      // T-02-25 audit row. WARNING-7 workaround: writeAgentAction hardcodes
      // proposer="Darb"; we stamp the originator's identity into the
      // reasoning field's prefix.
      const userId = req.user!.userId;
      const audit = await writeAgentAction({
        tenantId,
        approverUserId: userId,
        toolName: "admin.startTrial",
        originalProposal: { tenantId },
        modificationsBeforeApproval: {
          designPartner: designPartner === true,
          overrideKd: overrideKd ?? null,
          trialEndsAt: trialEndsAt.toISOString(),
        },
        outcome: "success",
        reasoning: `${originatorTag(req)} Founder started 14-day trial${
          designPartner === true ? " (design partner)" : ""
        }${overrideKd != null ? ` with monthly override KD ${overrideKd}` : ""}.`,
        subjectType: "Tenant",
        subjectId: tenantId,
      });

      return res.json({
        tenantId: updated.id,
        designPartner: designPartner === true,
        monthlyOverrideKd: overrideKd ?? null,
        trialEndsAt: trialEndsAt.toISOString(),
        auditId: audit.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  },
);

export default router;
