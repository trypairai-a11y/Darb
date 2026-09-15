/**
 * /api/compliance — revision 20, the Compliance tab of the HQ portal.
 *
 * Three subtabs, one router: driver documents, the renewal schedule, and the
 * merchant / delivery-company documents. They are one router because they are
 * one job done against one table, and splitting them would have meant three
 * places to remember the write-through to `Driver.<doc>Status`.
 *
 * Gated on the COMPLIANCE surface rather than on a role. The client described
 * a compliance TEAM, and the whole point of revision 4 (#12) was that a team
 * is a set of people who were granted a screen, not a rank in the hierarchy —
 * a compliance officer is typically a VIEWER with this one surface on EDIT.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { requireSurface } from "../middleware/requireSurface";
import { getPagination, paginatedResponse } from "../utils/pagination";
import {
  approveDocument,
  autoCheckDocument,
  complianceCounts,
  docTypesFor,
  listDocuments,
  rejectDocument,
  renewalSchedule,
  requestDocument,
  setComplianceFreeze,
  type DocScope,
  type FreezeTarget,
} from "../services/compliance/complianceService";

const router = Router();
router.use(authMiddleware, tenantScope);

const SCOPES: DocScope[] = ["DRIVER", "COMPANY", "VENDOR"];
const isScope = (v: unknown): v is DocScope => SCOPES.includes(v as DocScope);
const TARGETS: FreezeTarget[] = ["DRIVER", "FLEET", "VENDOR"];

/** Route errors carry a statusCode from the service, or fall back to 500. */
function fail(res: Response, err: unknown) {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  const code = (err as { code?: string })?.code;
  res.status(status).json({
    error: err instanceof Error ? err.message : "Request failed",
    ...(code ? { code } : {}),
  });
}

// ─── Counts, for the tab strip and the rail badge ───────────────────────────

router.get("/counts", requireSurface("COMPLIANCE"), async (req: Request, res: Response) => {
  try {
    res.json(await complianceCounts(req.user!.tenantId));
  } catch (err) {
    fail(res, err);
  }
});

/** The catalogue a request-a-document form offers, per scope. */
router.get("/doc-types", requireSurface("COMPLIANCE"), async (req: Request, res: Response) => {
  const scope = isScope(req.query.scope) ? req.query.scope : "DRIVER";
  res.json({ scope, types: docTypesFor(scope) });
});

// ─── The review queue ───────────────────────────────────────────────────────

/**
 * GET /api/compliance/documents
 *
 * ?scope=DRIVER|COMPANY|VENDOR  which subtab is open
 * ?status=REQUESTED|PENDING_REVIEW|VALID|REJECTED|EXPIRED|SUPERSEDED
 * ?flagged=true                 only what the automatic pass flagged
 */
router.get("/documents", requireSurface("COMPLIANCE"), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const { total, rows } = await listDocuments({
      tenantId: req.user!.tenantId,
      scope: isScope(req.query.scope) ? req.query.scope : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      flaggedOnly: req.query.flagged === "true",
      fleetPartnerId: typeof req.query.fleetPartnerId === "string" ? req.query.fleetPartnerId : undefined,
      vendorId: typeof req.query.vendorId === "string" ? req.query.vendorId : undefined,
      driverId: typeof req.query.driverId === "string" ? req.query.driverId : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      skip,
      take: limit,
    });
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Re-run the automatic pass on one document.
 *
 * The desk needs this because the pass runs at upload time and a document's
 * verdict can change without the document changing: an expiry that was three
 * months away when it landed is inside the warning window by the time somebody
 * opens it.
 */
router.post(
  "/documents/:id/recheck",
  requireSurface("COMPLIANCE", "EDIT"),
  async (req: Request, res: Response) => {
    try {
      const result = await autoCheckDocument(req.user!.tenantId, req.params.id);
      if (!result) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/documents/:id/approve",
  requireSurface("COMPLIANCE", "EDIT"),
  async (req: Request, res: Response) => {
    try {
      const raw = req.body?.expiryDate;
      const expiryDate =
        raw === undefined ? undefined : raw === null || raw === "" ? null : new Date(raw);
      if (expiryDate instanceof Date && Number.isNaN(expiryDate.getTime())) {
        res.status(400).json({ error: "expiryDate is not a date" });
        return;
      }
      const doc = await approveDocument({
        tenantId: req.user!.tenantId,
        documentId: req.params.id,
        reviewerId: req.user!.userId,
        ...(expiryDate !== undefined ? { expiryDate } : {}),
      });
      res.json({ ok: true, document: doc });
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/documents/:id/reject",
  requireSurface("COMPLIANCE", "EDIT"),
  async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason) {
        // Same rule the fleet request desk enforces: "rejected" with no reason
        // is a phone call Darb has to take anyway.
        res.status(400).json({ error: "A reason is required" });
        return;
      }
      const doc = await rejectDocument({
        tenantId: req.user!.tenantId,
        documentId: req.params.id,
        reviewerId: req.user!.userId,
        reason,
      });
      res.json({ ok: true, document: doc });
    } catch (err) {
      fail(res, err);
    }
  },
);

/**
 * POST /api/compliance/documents/request
 *
 * "the compliance team should be able to ask for extra documents from this
 * subtab". The ask is a REQUESTED row, so it lands in the same list the upload
 * will arrive in instead of in a note somebody has to match up by eye.
 */
router.post(
  "/documents/request",
  requireSurface("COMPLIANCE", "EDIT"),
  async (req: Request, res: Response) => {
    try {
      const { scope, type, note, driverId, fleetPartnerId, vendorId } = req.body ?? {};
      if (!isScope(scope)) {
        res.status(400).json({ error: "scope must be DRIVER, COMPANY or VENDOR" });
        return;
      }
      if (typeof type !== "string" || !type.trim()) {
        res.status(400).json({ error: "type is required" });
        return;
      }
      const doc = await requestDocument({
        tenantId: req.user!.tenantId,
        scope,
        type: type.trim(),
        note: typeof note === "string" ? note : null,
        requestedById: req.user!.userId,
        driverId: driverId ?? null,
        fleetPartnerId: fleetPartnerId ?? null,
        vendorId: vendorId ?? null,
      });
      res.status(201).json(doc);
    } catch (err) {
      fail(res, err);
    }
  },
);

// ─── The renewal schedule ───────────────────────────────────────────────────

/**
 * GET /api/compliance/renewals
 *
 * "the system will give a list of documents that will expire or already
 * expired". ?withinDays widens the horizon past the default 30.
 */
router.get("/renewals", requireSurface("COMPLIANCE"), async (req: Request, res: Response) => {
  try {
    const withinDaysRaw = Number(req.query.withinDays);
    const rows = await renewalSchedule({
      tenantId: req.user!.tenantId,
      withinDays: Number.isFinite(withinDaysRaw) && withinDaysRaw > 0 ? withinDaysRaw : undefined,
      scope: isScope(req.query.scope) ? req.query.scope : undefined,
      includeExpired: req.query.includeExpired !== "false",
    });
    res.json({
      rows,
      counts: {
        expired: rows.filter((r) => r.health === "EXPIRED").length,
        expiring: rows.filter((r) => r.health === "EXPIRING").length,
        frozen: rows.filter((r) => r.frozen).length,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * POST /api/compliance/freeze
 *
 * "should be able to give the compliance team the ability to freeze accounts
 * when the documents expire". A freeze needs a reason, and unfreezing is the
 * same endpoint with frozen:false so the two can never drift apart.
 */
router.post("/freeze", requireSurface("COMPLIANCE", "EDIT"), async (req: Request, res: Response) => {
  try {
    const { target, id, frozen, reason } = req.body ?? {};
    if (!TARGETS.includes(target)) {
      res.status(400).json({ error: "target must be DRIVER, FLEET or VENDOR" });
      return;
    }
    if (typeof id !== "string" || !id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    const result = await setComplianceFreeze({
      tenantId: req.user!.tenantId,
      target,
      id,
      frozen: frozen !== false,
      reason: typeof reason === "string" ? reason : null,
    });
    res.json({ ok: true, account: result });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Who the desk can ask for a document: the accounts, for the picker on the
 * request form. Small lists, so they travel together rather than as three
 * lookups the form cannot render until the last of them lands.
 */
router.get("/accounts", requireSurface("COMPLIANCE"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const [fleets, vendors, drivers] = await Promise.all([
      prisma.fleetPartner.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, complianceFrozenAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.vendor.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, code: true, complianceFrozenAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.driver.findMany({
        where: { tenantId, status: { not: "TERMINATED" } },
        select: {
          id: true,
          name: true,
          driverCode: true,
          isFrozen: true,
          fleetPartner: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        take: 1000,
      }),
    ]);
    res.json({ fleets, vendors, drivers });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
