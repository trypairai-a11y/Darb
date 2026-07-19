/**
 * Darb 2.0 — /api/foodics (plan §A6/§A8). TWO routers:
 *
 *   foodicsRouter (default export) — authMiddleware + tenantScope:
 *     GET  /connect?vendorId=     → {authUrl} (ADMIN/OPS_MANAGER, or VENDOR
 *                                   for its own vendorId)
 *     GET  /status?vendorId=      → {status, foodicsBusinessId, orderTagId,
 *                                   lastEventAt, webhookPath, branchMap}
 *     GET  /branches?vendorId=    → live Foodics branch list (for mapping UI)
 *     POST /branch-map            → {vendorId, mappings:[{branchId,
 *                                   foodicsBranchId, lat?, lng?}]}
 *     POST /disconnect            → {vendorId} — status DISCONNECTED + token
 *                                   nulled (webhookSecret KEPT so a
 *                                   reconnect reuses the registered URL)
 *
 *   foodicsCallbackRouter (named export) — PUBLIC (no auth): the OAuth
 *     redirect arrives from the Foodics console with NO Darb JWT; identity
 *     comes from the signed state JWT inside the query string.
 *     GET /callback?code=&state=  → handleCallback → redirect to
 *       {FRONTEND_URL}/vendors/{vendorId}?foodics=connected (or minimal
 *       success HTML when FRONTEND_URL is unset).
 *
 * MOUNTING (integration item — server.ts owned by another track):
 *   app.use("/api/foodics", foodicsCallbackRouter); // public, BEFORE authed
 *   app.use("/api/foodics", foodicsRouter);
 * (The callback router defines ONLY GET /callback, so sharing the prefix is
 * safe; /api/foodics is already inside the VENDOR containment allowlist.)
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { buildAuthorizeUrl, handleCallback, verifyState } from "../services/foodics/oauth";
import { decryptConnectionToken, foodicsGet, FoodicsConfigError } from "../services/foodics/client";

const STAFF_MANAGE_ROLES = ["ADMIN", "OPS_MANAGER"];

// ─── Authed router ──────────────────────────────────────────────────────────

const router = Router();
router.use(authMiddleware, tenantScope);

/**
 * ADMIN/OPS_MANAGER manage any vendor; a VENDOR user only its own vendorId
 * (from the JWT — never the client). Everything else ⇒ null (403).
 */
function resolveManagedVendorId(req: Request): string | null {
  const requested = typeof req.query.vendorId === "string" ? req.query.vendorId : null;
  const user = req.user!;
  if (user.role === "VENDOR") {
    if (!user.vendorId) return null;
    if (requested && requested !== user.vendorId) return null;
    return user.vendorId;
  }
  if (STAFF_MANAGE_ROLES.includes(user.role)) return requested;
  return null;
}

/** Staff (any non-VENDOR role) read any vendor; VENDOR reads its own. */
function resolveReadableVendorId(req: Request): string | null {
  const requested = typeof req.query.vendorId === "string" ? req.query.vendorId : null;
  const user = req.user!;
  if (user.role === "VENDOR") {
    if (!user.vendorId) return null;
    if (requested && requested !== user.vendorId) return null;
    return user.vendorId;
  }
  return requested;
}

/**
 * @swagger
 * /api/foodics/connect:
 *   get:
 *     tags: [Foodics]
 *     summary: Build the Foodics console authorize URL for a vendor
 */
router.get("/connect", async (req: Request, res: Response) => {
  try {
    const vendorId = resolveManagedVendorId(req);
    if (!vendorId) {
      res.status(req.query.vendorId ? 403 : 400).json({
        error: req.query.vendorId
          ? "Insufficient permissions for this vendor"
          : "vendorId is required",
      });
      return;
    }
    const tenantId = req.user!.tenantId;
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId },
      select: { id: true },
    });
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    const authUrl = buildAuthorizeUrl(tenantId, vendorId);
    res.json({ authUrl });
  } catch (err: any) {
    if (err instanceof FoodicsConfigError) {
      res.status(503).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/foodics/status:
 *   get:
 *     tags: [Foodics]
 *     summary: Connection status + branch mapping for a vendor
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const vendorId = resolveReadableVendorId(req);
    if (!vendorId) {
      res.status(req.query.vendorId ? 403 : 400).json({
        error: req.query.vendorId ? "Insufficient permissions for this vendor" : "vendorId is required",
      });
      return;
    }
    const tenantId = req.user!.tenantId;

    const [connection, branchMap] = await Promise.all([
      prisma.foodicsConnection.findFirst({ where: { vendorId, tenantId } }),
      prisma.vendorBranch.findMany({
        where: { tenantId, vendorId },
        select: {
          id: true, name: true, nameAr: true, foodicsBranchId: true,
          lat: true, lng: true, zoneId: true, isActive: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    // Business identity lives inside the encrypted token envelope (no
    // dedicated column) — decrypt defensively, never fail the status call.
    let foodicsBusinessId: string | null = null;
    if (connection?.accessTokenEnc) {
      try {
        foodicsBusinessId = decryptConnectionToken(connection).businessId ?? null;
      } catch (err) {
        logger.warn({ err, vendorId }, "foodics status: could not decrypt token envelope");
      }
    }

    res.json({
      status: connection?.status ?? "NOT_CONNECTED",
      foodicsBusinessId,
      orderTagId: connection?.orderTagId ?? null,
      lastEventAt: connection?.lastEventAt ?? null,
      // Path only — the host depends on deployment; secret is required to
      // register the webhook on the Foodics console.
      webhookPath: connection ? `/api/webhooks/foodics/${connection.webhookSecret}` : null,
      branchMap,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/foodics/branches:
 *   get:
 *     tags: [Foodics]
 *     summary: Live Foodics branch list for the mapping UI
 */
router.get("/branches", async (req: Request, res: Response) => {
  try {
    const vendorId = resolveManagedVendorId(req);
    if (!vendorId) {
      res.status(req.query.vendorId ? 403 : 400).json({
        error: req.query.vendorId ? "Insufficient permissions for this vendor" : "vendorId is required",
      });
      return;
    }
    const tenantId = req.user!.tenantId;
    const connection = await prisma.foodicsConnection.findFirst({
      where: { vendorId, tenantId },
    });
    if (!connection || connection.status !== "CONNECTED" || !connection.accessTokenEnc) {
      res.status(409).json({ error: "Vendor is not connected to Foodics" });
      return;
    }
    const result = await foodicsGet<{ data?: Array<Record<string, unknown>> }>(
      connection,
      "/branches",
    );
    const branches = (result?.data ?? []).map((b) => ({
      foodicsBranchId: b.id ?? null,
      name: b.name ?? null,
      nameAr: b.name_localized ?? null,
      latitude: b.latitude ?? null,
      longitude: b.longitude ?? null,
      phone: b.phone ?? null,
      address: b.address ?? null,
    }));
    res.json({ branches });
  } catch (err: any) {
    res.status(502).json({ error: `Foodics branches fetch failed: ${err.message}` });
  }
});

const branchMapSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  mappings: z
    .array(
      z.object({
        branchId: z.string().min(1),
        foodicsBranchId: z.string().min(1).nullable(),
        lat: z.number().gte(-90).lte(90).optional(),
        lng: z.number().gte(-180).lte(180).optional(),
      }),
    )
    .min(1, "At least one mapping is required"),
});

/**
 * @swagger
 * /api/foodics/branch-map:
 *   post:
 *     tags: [Foodics]
 *     summary: Map Foodics branch ids onto VendorBranch rows (+ optional coords)
 */
router.post(
  "/branch-map",
  rbac(...STAFF_MANAGE_ROLES),
  validateBody(branchMapSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { vendorId, mappings } = req.body as z.infer<typeof branchMapSchema>;

      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, tenantId },
        select: { id: true },
      });
      if (!vendor) {
        res.status(404).json({ error: "Vendor not found" });
        return;
      }

      const results: Array<{ branchId: string; updated: boolean }> = [];
      for (const mapping of mappings) {
        try {
          const updated = await prisma.vendorBranch.updateMany({
            where: { id: mapping.branchId, tenantId, vendorId },
            data: {
              foodicsBranchId: mapping.foodicsBranchId,
              ...(mapping.lat !== undefined ? { lat: mapping.lat } : {}),
              ...(mapping.lng !== undefined ? { lng: mapping.lng } : {}),
            },
          });
          results.push({ branchId: mapping.branchId, updated: updated.count > 0 });
        } catch (err) {
          if ((err as { code?: string })?.code === "P2002") {
            res.status(400).json({
              error: `foodicsBranchId ${mapping.foodicsBranchId} is already mapped to another branch`,
            });
            return;
          }
          throw err;
        }
      }

      const branchMap = await prisma.vendorBranch.findMany({
        where: { tenantId, vendorId },
        select: { id: true, name: true, foodicsBranchId: true, lat: true, lng: true },
        orderBy: { name: "asc" },
      });
      res.json({ results, branchMap });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

const disconnectSchema = z.object({ vendorId: z.string().min(1, "Vendor is required") });

/**
 * @swagger
 * /api/foodics/disconnect:
 *   post:
 *     tags: [Foodics]
 *     summary: Disconnect Foodics (nulls the token, keeps the webhook secret)
 */
router.post(
  "/disconnect",
  validateBody(disconnectSchema),
  async (req: Request, res: Response) => {
    try {
      const { vendorId } = req.body as z.infer<typeof disconnectSchema>;
      const user = req.user!;
      const allowed =
        user.role === "VENDOR"
          ? user.vendorId === vendorId
          : STAFF_MANAGE_ROLES.includes(user.role);
      if (!allowed) {
        res.status(403).json({ error: "Insufficient permissions for this vendor" });
        return;
      }
      const tenantId = user.tenantId;
      const updated = await prisma.foodicsConnection.updateMany({
        where: { vendorId, tenantId },
        data: { status: "DISCONNECTED", accessTokenEnc: null },
      });
      if (updated.count === 0) {
        res.status(404).json({ error: "No Foodics connection for this vendor" });
        return;
      }
      res.json({ ok: true, status: "DISCONNECTED" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Public callback router ─────────────────────────────────────────────────

export const foodicsCallbackRouter = Router();

function callbackRedirect(res: Response, vendorId: string | null, outcome: "connected" | "error", message?: string): void {
  const frontend = process.env.FRONTEND_URL;
  if (frontend && vendorId) {
    const qs = new URLSearchParams({ foodics: outcome, ...(message ? { message } : {}) });
    res.redirect(`${frontend.replace(/\/+$/, "")}/vendors/${vendorId}?${qs.toString()}`);
    return;
  }
  res
    .status(outcome === "connected" ? 200 : 400)
    .send(
      `<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">` +
        (outcome === "connected"
          ? `<h2>Foodics connected</h2><p>You can close this window and return to Darb.</p>`
          : `<h2>Foodics connection failed</h2><p>${message ?? "Please try again from the Darb vendor page."}</p>`) +
        `</body></html>`,
    );
}

/**
 * GET /api/foodics/callback?code=&state= — PUBLIC. Identity comes ONLY from
 * the signed state JWT (tenantId + vendorId + 10-minute expiry).
 */
foodicsCallbackRouter.get("/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  let vendorId: string | null = null;
  try {
    if (!state) throw new Error("Missing state");
    vendorId = verifyState(state).vendorId;
    if (!code) throw new Error("Missing authorization code");

    const result = await handleCallback(code, state);
    logger.info(
      {
        vendorId: result.connection.vendorId,
        foodicsBusinessId: result.foodicsBusinessId,
        branches: result.branches.length,
      },
      "foodics: vendor connected via OAuth callback",
    );
    callbackRedirect(res, result.connection.vendorId, "connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    logger.warn({ err, vendorId }, "foodics: OAuth callback failed");
    callbackRedirect(res, vendorId, "error", message);
  }
});

export default router;
export { router as foodicsRouter };
