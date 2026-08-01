// Darb 2.0 PRD §9 — fleet-partner portal (/api/fleet). FLEET-role JWT only;
// fleetPartnerId always comes from the token, never the client (mirror of
// vendorPortal). Containment: middleware/fleetContainment fences FLEET
// tokens to /api/auth + /api/fleet + /api/events.

import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { fleetScope } from "../middleware/fleetScope";
import { getFleetScorecard } from "../services/fleetService";
import { getFleetDriverComparison } from "../services/fleet/fleetDriverScoreService";
import { getDriverRating } from "../services/ratingService";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { presignPutUrl, presignGetUrl } from "../services/r2Service";
import {
  COMPANY_DOC_TYPES,
  isCompanyDocType,
  isDriverDocType,
  isStorageConfigured,
} from "../services/fleet/fleetDocumentService";
import {
  createFleetRequest,
  REQUESTABLE_STATUSES,
} from "../services/fleet/fleetRequestService";
import {
  rosterActivity,
  driverMonthActivity,
} from "../services/fleet/fleetActivityService";
import { readInvoiceInput, sendInvoice } from "../services/fleet/fleetInvoiceService";
import {
  FLEET_TABS,
  FleetPortalRole,
  FleetTab,
  effectiveFleetTabs,
  isFleetPortalRole,
  isFleetTab,
  normaliseFleetRole,
  parseFleetPartnerIds,
  parseFleetTabs,
} from "../services/fleet/fleetTabService";

const router = Router();
// ADMIN is admitted only so fleetScope can decide: it lets an admin read a
// named partner's portal and refuses everything else. See fleetScope.
router.use(authMiddleware, tenantScope, rbac("FLEET", "ADMIN"), fleetScope);

/**
 * Who this caller is, read from the User row rather than from their token
 * (revision 13, #6 — the rule revision 11 #5 settled on the merchant side).
 *
 * A token is minted once and carries whatever was true that day. If the role
 * and the company list came off the JWT, an owner who moved somebody to
 * payouts-only would change nothing until that person's token expired, and the
 * rail would keep drawing entries the server refuses. One query, resolved once
 * per request by middleware, so every helper below stays synchronous.
 */
interface FleetIdentity {
  fleetRole: FleetPortalRole;
  tabs: FleetTab[];
  /** The companies inside the group this login may act for, null = all of them. */
  partnerIds: string[] | null;
  displayName: string;
}

function fleetIdentityOf(req: Request): FleetIdentity | null {
  return (req as { _fleetIdentity?: FleetIdentity })._fleetIdentity ?? null;
}

/**
 * An inspecting ADMIN is not a fleet login and has no row to read here. They
 * are already fenced to read-only by fleetScope, so they get no identity and
 * every gate below stands aside for them rather than inventing an answer.
 */
async function loadFleetIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== "FLEET") { next(); return; }
    const row = await prisma.user.findFirst({
      where: { id: req.user.userId, tenantId: req.user.tenantId },
      select: {
        fleetRole: true, fleetTabs: true, fleetPartnerIds: true,
        isActive: true, name: true, email: true,
      },
    });
    // Fail closed. A missing row used to normalise to OWNER with every tab, so
    // a token whose user had been deleted got MORE access than one whose user
    // exists. And `isActive` is read here because authMiddleware never touches
    // the database: without this, switching a login off in the Team tab did
    // nothing until the token expired, while the owner watched the badge go
    // grey and believed it.
    if (!row) {
      res.status(401).json({ error: "This login no longer exists" });
      return;
    }
    if (row.isActive === false) {
      res.status(403).json({ error: "This login has been switched off" });
      return;
    }
    (req as { _fleetIdentity?: FleetIdentity })._fleetIdentity = {
      fleetRole: normaliseFleetRole(row.fleetRole),
      tabs: effectiveFleetTabs(row.fleetRole, row.fleetTabs),
      partnerIds: parseFleetPartnerIds(row.fleetPartnerIds),
      displayName: row.name?.trim() || row.email || req.user.email,
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

router.use(loadFleetIdentity);

function fleetRoleOf(req: Request): FleetPortalRole {
  return fleetIdentityOf(req)?.fleetRole ?? "OWNER";
}

/** Guard a route to a set of portal sub-roles. */
function requireFleetRole(...allowed: FleetPortalRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // No identity means an inspecting admin, already read-only by fleetScope.
    if (!fleetIdentityOf(req)) { next(); return; }
    if (!allowed.includes(fleetRoleOf(req))) {
      res.status(403).json({ error: "Not permitted for this portal role" });
      return;
    }
    next();
  };
}

/**
 * Guard a route to one portal tab.
 *
 * The refusal names itself and names the tab, exactly as the merchant portal's
 * does (revision 11, #7): the portal locks that one rail entry from the code
 * rather than guessing the tab from a URL, so a refused tab shows a padlock and
 * not "Request failed with status code 403". The role-based 403 above
 * deliberately carries no code — a supervisor refused the Add login button has
 * not lost the Team tab.
 */
function requireFleetTab(tab: FleetTab) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = fleetIdentityOf(req);
    if (identity && !identity.tabs.includes(tab)) {
      res
        .status(403)
        .json({ error: "This tab is not part of your access", code: "TAB_NOT_GRANTED", tab });
      return;
    }
    next();
  };
}

/** The tab list an owner posted, or undefined when they sent none. */
function readFleetTabsInput(raw: unknown): FleetTab[] | null | undefined {
  if (raw === undefined) return undefined;
  // Explicit null resets the user back to whatever their role opens.
  if (raw === null) return null;
  if (!Array.isArray(raw)) return undefined;
  const chosen = raw.filter(isFleetTab);
  return FLEET_TABS.filter((tab) => chosen.includes(tab));
}

/**
 * Resolve which fleet partner this request is acting as.
 *
 * Client revision #15/#27: Sidra, Marina and Nakheel share owners, and they
 * asked for one login across all of them rather than logging out and back in
 * per company. A user carrying an ownerGroupId may act as any partner in that
 * group; the active one arrives as ?fleetPartnerId= or the X-Fleet-Partner
 * header and is ALWAYS validated against the group before use, so the request
 * can widen its scope only to companies the same owner already controls.
 *
 * A user with no ownerGroupId behaves exactly as before: pinned to the single
 * fleetPartnerId baked into its token.
 *
 * Revision 13 (#6) adds one narrowing on top: a team login carrying
 * `fleetPartnerIds` may only act for the companies on that list, intersected
 * with the group. The list is a fence, not a preference — a login scoped to
 * Marina cannot reach Sidra by editing a query string.
 */
async function fleetContext(
  req: Request,
): Promise<{ tenantId: string; fleetPartnerId: string } | null> {
  const { tenantId } = req.user!;
  const tokenPartnerId = (req.user as { fleetPartnerId?: string }).fleetPartnerId;
  const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId;
  const scopedIds = fleetIdentityOf(req)?.partnerIds ?? null;

  if (!ownerGroupId) {
    if (!tokenPartnerId) return null;
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }

  const group = await prisma.fleetPartner.findMany({
    where: { tenantId, ownerGroupId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  // The intersection, and never the union: a scope list naming a company
  // outside the group cannot add it.
  const allowed = scopedIds ? group.filter((f) => scopedIds.includes(f.id)) : group;
  const allowedIds = new Set(allowed.map((f) => f.id));
  if (allowedIds.size === 0) {
    if (!tokenPartnerId) return null;
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }

  const requested =
    (typeof req.query.fleetPartnerId === "string" ? req.query.fleetPartnerId : undefined) ??
    (typeof req.headers["x-fleet-partner"] === "string"
      ? (req.headers["x-fleet-partner"] as string)
      : undefined);

  if (requested && allowedIds.has(requested)) {
    return { tenantId, fleetPartnerId: requested };
  }
  // An unknown or out-of-group request falls back to the token's own partner
  // rather than erroring, so a stale switcher selection cannot lock anyone out.
  if (tokenPartnerId && allowedIds.has(tokenPartnerId)) {
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }
  return { tenantId, fleetPartnerId: allowed[0].id };
}

/**
 * @swagger
 * /api/fleet/companies:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Fleet partners this login may switch between (revision #15/#27)
 */
router.get("/companies", async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId;
    const tokenPartnerId = (req.user as { fleetPartnerId?: string }).fleetPartnerId;

    const group = ownerGroupId
      ? await prisma.fleetPartner.findMany({
          where: { tenantId, ownerGroupId },
          select: { id: true, name: true, disciplineStatus: true },
          orderBy: { name: "asc" },
        })
      : tokenPartnerId
        ? await prisma.fleetPartner.findMany({
            where: { tenantId, id: tokenPartnerId },
            select: { id: true, name: true, disciplineStatus: true },
          })
        : [];

    // Revision 13 (#6). The switcher shows what this login may act for, not
    // what the group owns: offering a company every request then falls back
    // out of would look like a broken switcher rather than a fence.
    const scopedIds = fleetIdentityOf(req)?.partnerIds ?? null;
    const partners = scopedIds ? group.filter((f) => scopedIds.includes(f.id)) : group;

    const ctx = await fleetContext(req);
    res.json({ activeFleetPartnerId: ctx?.fleetPartnerId ?? null, partners });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/me:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet partner's own profile + commitments
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: {
        id: true, name: true, contactName: true, contactPhone: true, contactEmail: true,
        flatFeePerOrderKwd: true, minOnlineHoursPerDay: true, minDriversOnline: true,
        disciplineStatus: true, isActive: true, createdAt: true,
      },
    });
    if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }
    // Revision 13 (#6). The caller's own role and tab list ride along, so the
    // rail and the route fence agree with the server instead of 403ing after
    // the click. Same contract as /api/vendor/me's portalRole + portalTabs.
    const identity = fleetIdentityOf(req);
    res.json({
      ...fleet,
      portalRole: identity?.fleetRole ?? null,
      portalTabs: identity?.tabs ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Roster — the fleet's own drivers with doc statuses and ratings
 */
router.get("/drivers", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const drivers = await prisma.driver.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      select: {
        id: true, name: true, phone: true, status: true, vehicleType: true,
        // Revision 13 (#3) — the Darb-issued identifier the roster now shows.
        // A driver Darb has not approved does not have one: it is issued at
        // approval, and inventing it earlier would put a Darb number on
        // somebody who may be rejected.
        driverCode: true,
        performanceTier: true, throttledUntil: true,
        civilIdStatus: true, civilIdExpiry: true,
        drivingLicenseStatus: true, drivingLicenseExpiry: true,
        vehicleRegStatus: true, vehicleRegExpiry: true,
        healthCertStatus: true, healthCertExpiry: true,
      },
      orderBy: { name: "asc" },
    });
    // Revision 12 — the roster carries how much work each driver actually did.
    // `rosterActivity` is one grouped read for the whole fleet, not a query per
    // driver: the ratings loop below is already the expensive part.
    const [ratings, activity, pendingOnboards] = await Promise.all([
      Promise.all(drivers.map((d) => getDriverRating(ctx.tenantId, d.id))),
      rosterActivity(ctx.tenantId, ctx.fleetPartnerId),
      prisma.fleetChangeRequest.findMany({
        where: {
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          type: "DRIVER_ONBOARD",
          status: "PENDING",
        },
        select: { id: true, payload: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json([
      // A driver Darb has not approved yet has no Driver row, so it is drawn
      // from its own request. The fleet asked for them and needs to see that
      // the ask is sitting somewhere, not that it vanished.
      ...pendingOnboards.map((r) => {
        const p = (r.payload ?? {}) as Record<string, any>;
        return {
          id: `pending:${r.id}`,
          requestId: r.id,
          pending: true,
          name: p.name ?? "",
          phone: p.phone ?? "",
          driverCode: null,
          status: "PENDING_REVIEW",
          vehicleType: p.vehicleType ?? "MOTORCYCLE",
          performanceTier: null,
          throttledUntil: null,
          civilIdStatus: null, civilIdExpiry: null,
          drivingLicenseStatus: null, drivingLicenseExpiry: null,
          vehicleRegStatus: null, vehicleRegExpiry: null,
          healthCertStatus: null, healthCertExpiry: null,
          rating: { avg: null, count: 0 },
          ordersToday: 0,
          ordersLast7d: 0,
          submittedAt: r.createdAt,
        };
      }),
      ...drivers.map((d, i) => ({
        ...d,
        pending: false,
        rating: ratings[i],
        ordersToday: activity.get(d.id)?.ordersToday ?? 0,
        ordersLast7d: activity.get(d.id)?.ordersLast7d ?? 0,
      })),
    ]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/scorecard:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's own performance scorecard (default: last 30 days)
 */
router.get("/scorecard", requireFleetTab("SCORECARD"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    // Inclusive calendar days, same contract as /api/fleets/:id/scorecard:
    // the scorecard queries are `lt: to`, so a date-only `to` has to become
    // that day's end or the partner's "today" reads as an empty day.
    const to =
      typeof req.query.to === "string" ? parseLocalDateEnd(req.query.to) : new Date();
    const from =
      typeof req.query.from === "string"
        ? parseLocalDate(req.query.from)
        : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      res.status(400).json({ error: "`from` and `to` must be YYYY-MM-DD dates, `from` first" });
      return;
    }
    // Revision 13b — the averages, plus the two ends of the driver list. An
    // average never names anybody, and naming somebody is what makes a
    // scorecard something a supervisor can act on.
    const [scorecard, drivers] = await Promise.all([
      getFleetScorecard(ctx.tenantId, ctx.fleetPartnerId, { from, to }),
      getFleetDriverComparison(ctx.tenantId, ctx.fleetPartnerId, { from, to }),
    ]);
    res.json({ ...scorecard, drivers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/statements:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's monthly payout statements
 */
router.get("/statements", requireFleetTab("PAYOUTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const rows = await prisma.fleetPayoutStatement.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/earnings:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Per-order earnings for a month (delivered orders x flat fee)
 */
router.get("/earnings", requireFleetTab("PAYOUTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

    const month = typeof req.query.month === "string" ? req.query.month : null;
    const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
    const now = new Date();
    const start = m
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

    const [fleet, orders, deliveredCount] = await Promise.all([
      prisma.fleetPartner.findFirst({
        where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
        select: { flatFeePerOrderKwd: true },
      }),
      prisma.deliveryOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: start, lt: end },
          driver: { fleetPartnerId: ctx.fleetPartnerId },
        },
        select: {
          id: true, orderNumber: true, deliveredAt: true,
          driver: { select: { id: true, name: true } },
        },
        orderBy: { deliveredAt: "desc" },
        take: 1000,
      }),
      // Counted, not measured off the list above. The headline used to be
      // `orders.length`, so a fleet past 1000 orders in a month watched its
      // running earnings freeze at KD 1100.000 and quietly understate.
      prisma.deliveryOrder.count({
        where: {
          tenantId: ctx.tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: start, lt: end },
          driver: { fleetPartnerId: ctx.fleetPartnerId },
        },
      }),
    ]);

    const fee = Number(fleet?.flatFeePerOrderKwd ?? 1.1);
    res.json({
      periodStart: start,
      periodEnd: end,
      feePerOrderKwd: fee.toFixed(3),
      deliveredOrders: deliveredCount,
      totalKwd: (deliveredCount * fee).toFixed(3),
      // The list is capped; the figures above are not. Say so rather than let
      // a truncated table look like the whole month.
      listTruncated: orders.length < deliveredCount,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        deliveredAt: o.deliveredAt,
        driverName: o.driver?.name ?? null,
        feeKwd: fee.toFixed(3),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Revision 12: the request desk ──────────────────────────────────────────
//
// Everything below either reads the fleet's own records or opens a request for
// Darb to review. The ONE thing that writes a live record is PATCH
// /drivers/:id/phone, and it is marked as such where it is defined.
//
// fleetScope already fences an inspecting ADMIN to GET, so none of the writes
// here need to re-check the role: a non-FLEET caller cannot reach them.

/**
 * The dates a status request has to carry (revision 13, #4 and #5).
 *
 * Leave needs both ends of it: a delivery company that says a driver is off
 * without saying until when has moved the phone call, not removed it, and Darb
 * cannot plan a zone around it. A resignation needs the last working day
 * because that is the day the driver stops counting towards the payout.
 *
 * Date-only strings (YYYY-MM-DD), stored as given rather than as timestamps:
 * these are calendar days in Kuwait, not instants, and a timezone conversion
 * on a leave date is how a driver comes back a day early on one screen.
 */
function readStatusDates(
  status: string,
  input: { leaveStartDate?: string; returnDate?: string; lastWorkingDate?: string },
): { value?: Record<string, string | null>; error?: string } {
  const isDate = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

  if (status === "LEAVE") {
    if (!isDate(input.leaveStartDate)) {
      return { error: "A leave start date is required (YYYY-MM-DD)" };
    }
    if (!isDate(input.returnDate)) {
      return { error: "A return date is required (YYYY-MM-DD)" };
    }
    if (input.returnDate < input.leaveStartDate) {
      return { error: "The return date cannot be before the leave date" };
    }
    return {
      value: {
        leaveStartDate: input.leaveStartDate,
        returnDate: input.returnDate,
        lastWorkingDate: null,
      },
    };
  }

  if (status === "TERMINATED") {
    if (!isDate(input.lastWorkingDate)) {
      return { error: "A last working date is required (YYYY-MM-DD)" };
    }
    return {
      value: {
        lastWorkingDate: input.lastWorkingDate,
        leaveStartDate: null,
        returnDate: null,
      },
    };
  }

  // Coming back to ACTIVE needs no date: the request itself is the date.
  return { value: {} };
}

/** Shared 403 for a driver that is not this fleet's to touch. */
async function ownDriverOr404(
  ctx: { tenantId: string; fleetPartnerId: string },
  driverId: string,
) {
  return prisma.driver.findFirst({
    where: { id: driverId, tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
  });
}

/**
 * @swagger
 * /api/fleet/documents:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The delivery company's own documents (revision 12)
 */
router.get("/documents", requireFleetTab("DOCUMENTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const docs = await prisma.fleetDocument.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId, driverId: null },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });
    res.json({
      documents: docs,
      requiredTypes: COMPANY_DOC_TYPES,
      storageConfigured: isStorageConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/documents/upload-url:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Presigned R2 PUT for a document (revision 12)
 *     description: >
 *       Fails closed with STORAGE_NOT_CONFIGURED rather than 500 when R2 is
 *       not wired up, so the portal can say so plainly instead of showing a
 *       file picker that dies. Same posture as WhatsApp and the payment
 *       gateway elsewhere in this codebase.
 */
router.post("/documents/upload-url", requireFleetTab("DOCUMENTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    if (!isStorageConfigured()) {
      res.status(503).json({
        error: "Document upload is not switched on yet. Contact Darb operations.",
        code: "STORAGE_NOT_CONFIGURED",
      });
      return;
    }

    const { type, contentType, fileName } = req.body as {
      type?: string; contentType?: string; fileName?: string;
    };
    if (!type || (!isCompanyDocType(type) && !isDriverDocType(type))) {
      res.status(400).json({ error: "Unknown document type" });
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!contentType || !allowed.includes(contentType)) {
      res.status(400).json({ error: "File must be a JPEG, PNG, WEBP or PDF" });
      return;
    }

    // The tenant prefix is the cross-tenant isolation boundary: even a leaked
    // presigned URL can only write inside the issuing tenant's own space.
    const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
    const key = `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/${type}/${Date.now()}.${ext}`;
    const url = await presignPutUrl(key, contentType, 300);
    res.json({ url, key, fileName: fileName ?? null, expiresInSec: 300 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/documents/{id}/url:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Short-lived signed GET for a document the fleet owns
 */
router.get("/documents/:id/url", requireFleetTab("DOCUMENTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const doc = await prisma.fleetDocument.findFirst({
      where: { id: req.params.id, tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      select: { fileKey: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.fileKey) { res.status(404).json({ error: "No file on this document" }); return; }
    res.json({ url: await presignGetUrl(doc.fileKey, 3600) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Validate + normalise one document submission from the client.
 *
 * Returns both fields optional rather than a discriminated union: ts-jest
 * compiles this file with its own settings and did not narrow the union, so
 * the shape that works everywhere is the one that needs no narrowing.
 */
interface DocInputResult {
  value?: {
    type: string;
    fileKey: string | null;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    expiryDate: Date | null;
  };
  error?: string;
}

function readDocInput(body: any, keyPrefix?: string): DocInputResult {
  const { type, fileKey, fileName, mimeType, sizeBytes, expiryDate } = body ?? {};
  if (!type || (!isCompanyDocType(type) && !isDriverDocType(type))) {
    return { error: "Unknown document type" };
  }
  // Same fence as the invoice: a document row carries the key the download
  // endpoint later presigns, so a key from outside this fleet's own prefix
  // would be a read of somebody else's object.
  if (typeof fileKey === "string" && fileKey.length > 0 && keyPrefix && !fileKey.startsWith(keyPrefix)) {
    return { error: "That file does not belong to this account" };
  }
  if (!fileKey && !expiryDate) {
    return { error: "Give a file or an expiry date" };
  }
  const expiry = expiryDate ? new Date(expiryDate) : null;
  if (expiry && Number.isNaN(expiry.getTime())) {
    return { error: "expiryDate must be a date" };
  }
  return {
    value: {
      type,
      fileKey: fileKey ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
      expiryDate: expiry,
    },
  };
}

/**
 * @swagger
 * /api/fleet/documents:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Record a company document after upload and open a request
 */
router.post("/documents", requireFleetTab("DOCUMENTS"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const parsed = readDocInput(req.body, `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/`);
    if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
    if (!isCompanyDocType(parsed.value.type)) {
      res.status(400).json({ error: "That is a driver document. Upload it from the driver's profile." });
      return;
    }

    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    const doc = await prisma.fleetDocument.create({
      data: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        driverId: null,
        ...parsed.value,
        uploadedById: req.user!.userId,
      },
    });
    const request = await createFleetRequest({
      tenantId: ctx.tenantId,
      fleetPartnerId: ctx.fleetPartnerId,
      type: "COMPANY_DOCUMENT",
      payload: { documentType: parsed.value.type },
      documentIds: [doc.id],
      requestedById: req.user!.userId,
      fleetName: fleet?.name,
    });
    res.status(201).json({ document: doc, requestId: request.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: One driver's profile — details, documents, activity, open requests
 */
router.get("/drivers/:id", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const [rating, documents, requests, issues, activity] = await Promise.all([
      getDriverRating(ctx.tenantId, driver.id),
      prisma.fleetDocument.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      }),
      prisma.fleetChangeRequest.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.fleetIssue.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id, status: { not: "RESOLVED" } },
        orderBy: { openedAt: "desc" },
      }),
      driverMonthActivity(
        ctx.tenantId,
        driver.id,
        typeof req.query.month === "string" ? req.query.month : "",
      ),
    ]);

    res.json({
      driver: {
        id: driver.id, name: driver.name, phone: driver.phone,
        driverCode: driver.driverCode, status: driver.status,
        vehicleType: driver.vehicleType, zone: driver.zone,
        hireDate: driver.hireDate, performanceTier: driver.performanceTier,
        throttledUntil: driver.throttledUntil,
        civilIdExpiry: driver.civilIdExpiry, civilIdStatus: driver.civilIdStatus,
        drivingLicenseExpiry: driver.drivingLicenseExpiry, drivingLicenseStatus: driver.drivingLicenseStatus,
        vehicleRegExpiry: driver.vehicleRegExpiry, vehicleRegStatus: driver.vehicleRegStatus,
        vehicleInsuranceExpiry: driver.vehicleInsuranceExpiry, vehicleInsuranceStatus: driver.vehicleInsuranceStatus,
        healthCertExpiry: driver.healthCertExpiry, healthCertStatus: driver.healthCertStatus,
        workPermitExpiry: driver.workPermitExpiry, workPermitStatus: driver.workPermitStatus,
        foodHandlingCertExpiry: driver.foodHandlingCertExpiry, foodHandlingCertStatus: driver.foodHandlingCertStatus,
      },
      rating,
      documents,
      requests,
      issues,
      activity,
      storageConfigured: isStorageConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/activity:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Day-by-day delivered order counts for one month
 */
router.get("/drivers/:id/activity", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
    res.json(
      await driverMonthActivity(
        ctx.tenantId,
        driver.id,
        typeof req.query.month === "string" ? req.query.month : "",
      ),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Put a driver forward for Darb approval (revision 12)
 *     description: >
 *       Creates NO Driver row. The row is created when Darb approves, which is
 *       what stops a rejected submission leaving a half-driver in the dispatch
 *       candidate pool.
 */
router.post("/drivers", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

    const { name, phone, vehicleType, zone, hireDate, documents } = req.body as {
      name?: string; phone?: string; vehicleType?: string; zone?: string;
      hireDate?: string; documents?: any[];
    };
    if (!name || name.trim().length < 2) {
      res.status(400).json({ error: "Driver name is required" });
      return;
    }
    if (!phone || phone.trim().length < 8) {
      res.status(400).json({ error: "Driver phone is required" });
      return;
    }
    if (vehicleType !== "CAR" && vehicleType !== "MOTORCYCLE") {
      res.status(400).json({ error: "Vehicle must be CAR or MOTORCYCLE" });
      return;
    }

    // A phone already on the road is almost always the same person submitted
    // twice, and two Driver rows with one number breaks the app login.
    const clash = await prisma.driver.findFirst({
      where: { tenantId: ctx.tenantId, phone: phone.trim() },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "A driver with that phone number already exists" });
      return;
    }

    const docInputs: any[] = [];
    for (const raw of Array.isArray(documents) ? documents : []) {
      const parsed = readDocInput(raw, `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/`);
      if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
      if (!isDriverDocType(parsed.value.type)) {
        res.status(400).json({ error: `${parsed.value.type} is a company document` });
        return;
      }
      docInputs.push(parsed.value);
    }

    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    // driverId stays null on these until approval creates the driver.
    const created = await Promise.all(
      docInputs.map((d) =>
        prisma.fleetDocument.create({
          data: {
            tenantId: ctx.tenantId,
            fleetPartnerId: ctx.fleetPartnerId,
            driverId: null,
            ...d,
            uploadedById: req.user!.userId,
          },
        }),
      ),
    );

    const request = await createFleetRequest({
      tenantId: ctx.tenantId,
      fleetPartnerId: ctx.fleetPartnerId,
      type: "DRIVER_ONBOARD",
      payload: {
        name: name.trim(),
        phone: phone.trim(),
        vehicleType,
        zone: zone ?? null,
        hireDate: hireDate ?? null,
      },
      documentIds: created.map((d) => d.id),
      requestedById: req.user!.userId,
      fleetName: fleet?.name,
    });

    res.status(201).json({ request, documents: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/requests:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Ask Darb for a status, details or document change on a driver
 */
router.post("/drivers/:id/requests", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const { type } = req.body as { type?: string };
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    if (type === "DRIVER_STATUS") {
      const { status, reason, leaveStartDate, returnDate, lastWorkingDate } = req.body as {
        status?: string; reason?: string;
        leaveStartDate?: string; returnDate?: string; lastWorkingDate?: string;
      };
      if (!status || !(REQUESTABLE_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: `status must be one of ${REQUESTABLE_STATUSES.join(", ")}` });
        return;
      }

      // Revision 13 (#4, #5). "Amit is on leave" used to reach Darb with no
      // idea when he goes or comes back, and a resignation with no last day is
      // a payout question nobody can answer. Required here as well as in the
      // form: the form is a convenience, this is the contract.
      const dates = readStatusDates(status, {
        leaveStartDate, returnDate, lastWorkingDate,
      });
      if (dates.error) { res.status(400).json({ error: dates.error }); return; }

      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_STATUS",
        driverId: driver.id,
        payload: {
          status,
          reason: reason ?? null,
          driverName: driver.name,
          ...dates.value,
        },
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json(request);
      return;
    }

    if (type === "DRIVER_PROFILE") {
      const { name, vehicleType, zone } = req.body as {
        name?: string; vehicleType?: string; zone?: string;
      };
      if (!name && !vehicleType && zone === undefined) {
        res.status(400).json({ error: "Nothing to change" });
        return;
      }
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_PROFILE",
        driverId: driver.id,
        payload: { name, vehicleType, zone, driverName: driver.name },
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json(request);
      return;
    }

    if (type === "DRIVER_DOCUMENT") {
      // `type` on this endpoint names the KIND of request, so the document's
      // own type arrives as `documentType`. Reading `type` here would label
      // every driver document "DRIVER_DOCUMENT".
      const parsed = readDocInput(
        { ...req.body, type: req.body?.documentType },
        `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/`,
      );
      if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
      if (!isDriverDocType(parsed.value.type)) {
        res.status(400).json({ error: `${parsed.value.type} is a company document` });
        return;
      }
      const doc = await prisma.fleetDocument.create({
        data: {
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          driverId: driver.id,
          ...parsed.value,
          uploadedById: req.user!.userId,
        },
      });
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_DOCUMENT",
        driverId: driver.id,
        payload: { documentType: parsed.value.type, driverName: driver.name },
        documentIds: [doc.id],
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json({ request, document: doc });
      return;
    }

    res.status(400).json({ error: "type must be DRIVER_STATUS, DRIVER_PROFILE or DRIVER_DOCUMENT" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/phone:
 *   patch:
 *     tags: [Fleet Portal]
 *     summary: The ONE direct write in this portal (revision 12)
 *     description: >
 *       Every other change a delivery company makes is a request Darb reviews.
 *       The phone number is the exception, decided by the client: drivers change
 *       SIMs constantly and a review queue between a driver and their own number
 *       strands them. The cost is real and deliberate — phone is the driver
 *       app's sign-in identity, so this can log a driver out of the app.
 */
router.patch("/drivers/:id/phone", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const { phone } = req.body as { phone?: string };
    if (!phone || phone.trim().length < 8) {
      res.status(400).json({ error: "A phone number of at least 8 digits is required" });
      return;
    }
    const clash = await prisma.driver.findFirst({
      where: { tenantId: ctx.tenantId, phone: phone.trim(), id: { not: driver.id } },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "Another driver already has that phone number" });
      return;
    }

    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: { phone: phone.trim() },
      select: { id: true, name: true, phone: true },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/requests:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's own submissions and what Darb decided
 */
router.get("/requests", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await prisma.fleetChangeRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        ...(status ? { status: status as any } : {}),
      },
      include: { driver: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/requests/{id}/withdraw:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Pull a request back before Darb has decided
 */
router.post("/requests/:id/withdraw", requireFleetTab("ROSTER"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.fleetChangeRequest.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: "PENDING",
      },
      data: { status: "WITHDRAWN" },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request has already been decided" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Delivery issues Darb has raised against this fleet (revision 12)
 */
router.get("/issues", requireFleetTab("ISSUES"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const includeResolved = req.query.includeResolved === "true";
    const rows = await prisma.fleetIssue.findMany({
      where: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        ...(includeResolved ? {} : { status: { not: "RESOLVED" } }),
      },
      include: { driver: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      take: 200,
    });
    const openCount = rows.filter((r) => r.status !== "RESOLVED").length;
    res.json({ issues: rows, openCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues/{id}/acknowledge:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: The supervisor takes ownership of an issue
 */
router.post("/issues/:id/acknowledge", requireFleetTab("ISSUES"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.fleetIssue.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { in: ["OPEN", "ESCALATED"] },
      },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedById: req.user!.userId,
      },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That issue is not open" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues/{id}/resolve:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Close an issue with an account of what was done
 *     description: >
 *       The note is required. An acknowledge button with no account of the fix
 *       is a button that gets clicked to clear a badge, and the point of this
 *       tab is that somebody actually called the driver.
 */
router.post("/issues/:id/resolve", requireFleetTab("ISSUES"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { note } = req.body as { note?: string };
    if (!note || note.trim().length < 5) {
      res.status(400).json({ error: "Say what you did to resolve it" });
      return;
    }
    const claimed = await prisma.fleetIssue.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { not: "RESOLVED" },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: req.user!.userId,
        resolutionNote: note.trim(),
      },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That issue is already resolved" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Support: the fleet's channel to Darb ────────────────────────────────────
//
// The mirror of the merchant portal's support tab, on the same SupportTicket
// table. Issues flow Darb -> fleet; support flows fleet -> Darb. Two tabs
// because they are two different jobs, one table because Darb triages one
// inbox.

/**
 * @swagger
 * /api/fleet/support:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's support requests
 */
router.get("/support", requireFleetTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const tickets = await prisma.supportTicket.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Raise a support request with Darb
 */
router.post("/support", requireFleetTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { subject, body, type } = req.body as {
      subject?: string; body?: string; type?: string;
    };
    if (!subject || subject.trim().length < 3) {
      res.status(400).json({ error: "A subject is required" });
      return;
    }
    if (!body || body.trim().length < 5) {
      res.status(400).json({ error: "Tell Darb what the problem is" });
      return;
    }
    const allowedTypes = ["ORDER", "WALLET", "TECHNICAL", "OTHER"];
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: ctx.tenantId,
        vendorId: null,
        fleetPartnerId: ctx.fleetPartnerId,
        createdById: req.user!.userId,
        subject: subject.trim(),
        type: (type && allowedTypes.includes(type) ? type : "OTHER") as any,
        messages: {
          create: {
            tenantId: ctx.tenantId,
            author: "FLEET",
            authorName: req.user!.email ?? null,
            body: body.trim(),
          },
        },
      },
      include: { messages: true },
    });
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support/{id}/reply:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Add a message to an existing request
 */
router.post("/support/:id/reply", requireFleetTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { body } = req.body as { body?: string };
    if (!body || body.trim().length < 2) {
      res.status(400).json({ error: "Write a message" });
      return;
    }
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
      },
      select: { id: true, status: true },
    });
    if (!ticket) { res.status(404).json({ error: "Request not found" }); return; }
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ error: "That request was withdrawn" });
      return;
    }
    await prisma.supportTicketMessage.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: ticket.id,
        author: "FLEET",
        authorName: req.user!.email ?? null,
        body: body.trim(),
      },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "OPEN" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support/{id}/cancel:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Withdraw a request. CANCELLED, not RESOLVED.
 */
router.post("/support/:id/cancel", requireFleetTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.supportTicket.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { in: ["OPEN", "ANSWERED"] },
      },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request is already closed" });
      return;
    }
    await prisma.supportTicketMessage.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: req.params.id,
        author: "FLEET",
        authorName: req.user!.email ?? null,
        body: "Request withdrawn by the delivery company.",
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Revision 13 (#8): the company confirms its own payout ───────────────────
//
// Darb used to move a statement from FINAL to PAID on its own. The client asked
// for the delivery company to agree with the figure first, which is reasonable:
// it is their invoice, and a month they never saw is a month they argue about
// after the transfer instead of before it.
//
// FINAL -> CONFIRMED -> PAID, with a dispute back to FINAL's side of the line.
// The gate that actually stops a payment lives in postFleetPayout, not here, so
// the cron and a script are bound by it too.

/**
 * @swagger
 * /api/fleet/statements/{id}:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: One statement, with the orders it was built from
 *     description: >
 *       Client note on revision 13: the delivery company has to see what it is
 *       confirming. A period, a count and a total is a number to take on faith;
 *       this is the order-by-order working behind it.
 */
router.get(
  "/statements/:id",
  requireFleetTab("PAYOUTS"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

      const statement = await prisma.fleetPayoutStatement.findFirst({
        where: {
          id: req.params.id,
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
        },
        include: {
          invoice: {
            // Never the bytes. This payload is a screen, not a download.
            select: {
              id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true,
            },
          },
        },
      });
      if (!statement) { res.status(404).json({ error: "Statement not found" }); return; }

      // The same orders the statement was cut from: delivered inside the
      // period by a driver of this fleet. Recomputed rather than stored,
      // because the fee is snapshotted on the statement and the orders behind
      // it cannot change after delivery.
      const orders = await prisma.deliveryOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: statement.periodStart, lt: statement.periodEnd },
          driver: { fleetPartnerId: ctx.fleetPartnerId },
        },
        select: {
          id: true, orderNumber: true, deliveredAt: true,
          vendor: { select: { name: true } },
          driver: { select: { id: true, name: true, driverCode: true } },
        },
        orderBy: { deliveredAt: "asc" },
        take: 2000,
      });

      const fee = statement.feePerOrderKwd;

      // Client note: the statement should say how many each driver did. The
      // order list answers it only by counting rows by hand, which is the work
      // a statement exists to have done already.
      const byDriver = new Map<
        string,
        { driverId: string; name: string; driverCode: string | null; orders: number }
      >();
      for (const o of orders) {
        const id = o.driver?.id ?? "unassigned";
        const row = byDriver.get(id) ?? {
          driverId: id,
          name: o.driver?.name ?? "n/a",
          driverCode: o.driver?.driverCode ?? null,
          orders: 0,
        };
        row.orders += 1;
        byDriver.set(id, row);
      }
      const feeNumber = Number(fee);

      res.json({
        statement: {
          ...statement,
          feePerOrderKwd: fee.toFixed(3),
          totalKwd: statement.totalKwd.toFixed(3),
        },
        orders: orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          deliveredAt: o.deliveredAt,
          vendorName: o.vendor?.name ?? null,
          driverName: o.driver?.name ?? null,
          driverCode: o.driver?.driverCode ?? null,
          feeKwd: fee.toFixed(3),
        })),
        // Ordered by who did the most, because that is the order the question
        // "who carried this month" is asked in.
        byDriver: [...byDriver.values()]
          .sort((a, b) => b.orders - a.orders)
          .map((d) => ({ ...d, totalKwd: (d.orders * feeNumber).toFixed(3) })),
        // The count on the statement is the one that was paid on; a difference
        // here means orders were re-stated after the month closed, and the
        // company should see that rather than have it quietly reconciled.
        countedOrders: statement.deliveredOrders,
        listedOrders: orders.length,
        storageConfigured: isStorageConfigured(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleet/statements/{id}/invoice:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Download the stamped invoice this company uploaded
 */
router.get(
  "/statements/:id/invoice",
  requireFleetTab("PAYOUTS"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      const invoice = await prisma.fleetPayoutInvoice.findFirst({
        where: {
          statementId: req.params.id,
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
        },
      });
      if (!invoice) { res.status(404).json({ error: "No invoice on this statement" }); return; }
      await sendInvoice(res, invoice);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleet/statements/{id}/confirm:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Confirm a payout statement by uploading the stamped invoice
 *     description: >
 *       Client note on revision 13: confirmation IS the stamped invoice. A
 *       button click is a claim; the company's own stamped invoice is the
 *       document Darb's accountant can file against the transfer, so the file
 *       is required and the status only moves once it is stored.
 */
router.post(
  "/statements/:id/confirm",
  requireFleetTab("PAYOUTS"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

      const statement = await prisma.fleetPayoutStatement.findFirst({
        where: {
          id: req.params.id,
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
        },
        include: { invoice: { select: { id: true } } },
      });
      if (!statement) { res.status(404).json({ error: "Statement not found" }); return; }

      // Refuse a decided statement BEFORE touching the file. The upsert used to
      // run first, so confirming an already-PAID month answered 409 while
      // having already replaced the stamped invoice Darb filed against the
      // transfer — the one artefact this endpoint exists to preserve.
      if (statement.status !== "FINAL" && statement.status !== "DISPUTED") {
        res.status(409).json({ error: "That statement is already confirmed or paid" });
        return;
      }

      const parsed = readInvoiceInput(
        req.body,
        `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/`,
      );
      // A re-confirmation after a dispute needs a fresh file: the company is
      // being asked to stand behind the figure a second time.
      if (!parsed.value && (statement.status === "DISPUTED" || !statement.invoice)) {
        res.status(400).json({
          error: parsed.error ?? "Attach your stamped invoice to confirm this statement",
          code: "INVOICE_REQUIRED",
        });
        return;
      }
      if (req.body?.fileName && !parsed.value) {
        // They tried to attach something and it was not usable. Say so rather
        // than confirming on a previous month's file.
        res.status(400).json({ error: parsed.error });
        return;
      }

      // One transaction: the file and the status move together, so neither a
      // lost race nor a dead lambda can leave them disagreeing.
      const claimed = await prisma.$transaction(async (tx) => {
        if (parsed.value) {
          const data = {
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          statementId: statement.id,
          fileName: parsed.value.fileName,
          mimeType: parsed.value.mimeType,
          sizeBytes: parsed.value.sizeBytes,
          fileKey: parsed.value.fileKey,
          fileData: parsed.value.fileData,
            uploadedById: req.user!.userId,
            uploadedAt: new Date(),
          };
          // Re-confirming after a dispute replaces the file rather than
          // stacking two invoices against one month.
          await tx.fleetPayoutInvoice.upsert({
            where: { statementId: statement.id },
            create: data,
            update: data,
          });
        }

        // Status-guarded claim, same discipline as the request desk: two people
        // in the same office hitting Confirm must not both stamp it.
        return tx.fleetPayoutStatement.updateMany({
          where: {
            id: statement.id,
            tenantId: ctx.tenantId,
            fleetPartnerId: ctx.fleetPartnerId,
            status: { in: ["FINAL", "DISPUTED"] },
          },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            confirmedById: req.user!.userId,
          },
        });
      });
      if (claimed.count === 0) {
        res.status(409).json({ error: "That statement is already confirmed or paid" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleet/statements/{id}/dispute:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: The delivery company disagrees, with a reason, and Darb hears it
 *     description: >
 *       Opens a support ticket carrying the period and the total. A dispute
 *       that only sets a flag is a flag somebody has to notice; a ticket lands
 *       in the inbox Darb already triages.
 */
router.post(
  "/statements/:id/dispute",
  requireFleetTab("PAYOUTS"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

      const { reason } = req.body as { reason?: string };
      if (!reason || reason.trim().length < 10) {
        res.status(400).json({ error: "Say what is wrong with the statement" });
        return;
      }

      const statement = await prisma.fleetPayoutStatement.findFirst({
        where: {
          id: req.params.id,
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
        },
      });
      if (!statement) { res.status(404).json({ error: "Statement not found" }); return; }
      if (statement.status === "PAID") {
        res.status(409).json({ error: "That statement has already been paid" });
        return;
      }

      const period = statement.periodStart.toISOString().slice(0, 7);
      const ticket = await prisma.supportTicket.create({
        data: {
          tenantId: ctx.tenantId,
          vendorId: null,
          fleetPartnerId: ctx.fleetPartnerId,
          createdById: req.user!.userId,
          subject: `Payout query: ${period}`,
          // The enum stays WALLET; the fleet portal renders it as "Payout"
          // (revision 13, #7). One table is what lets Darb triage merchants and
          // delivery companies in one inbox.
          type: "WALLET",
          messages: {
            create: {
              tenantId: ctx.tenantId,
              author: "FLEET",
              authorName: fleetIdentityOf(req)?.displayName ?? req.user!.email ?? null,
              body:
                `${statement.deliveredOrders} orders x ${statement.feePerOrderKwd.toFixed(3)} KWD ` +
                `= ${statement.totalKwd.toFixed(3)} KWD for ${period}.\n\n${reason.trim()}`,
            },
          },
        },
      });

      const claimed = await prisma.fleetPayoutStatement.updateMany({
        where: {
          id: statement.id,
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          status: { in: ["FINAL", "CONFIRMED"] },
        },
        data: {
          status: "DISPUTED",
          disputedAt: new Date(),
          disputeReason: reason.trim(),
          disputeTicketId: ticket.id,
          // A disputed statement is not a confirmed one. Clearing the stamp is
          // what stops a company confirming, disputing, and still being paid on
          // the strength of the earlier click.
          confirmedAt: null,
          confirmedById: null,
        },
      });
      if (claimed.count === 0) {
        res.status(409).json({ error: "That statement has already been paid" });
        return;
      }

      res.status(201).json({ ok: true, ticketId: ticket.id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

// ─── Revision 13 (#6): the delivery company's own team ───────────────────────
//
// The mirror of the merchant portal's Team page, with branches replaced by the
// other delivery companies in the same owner group. Darb could always create a
// fleet's logins and the fleet could not, which made Darb the bottleneck for
// something an owner should do themselves.
//
// OWNER-only on the writes, on the endpoint as well as in the UI. A supervisor
// who could mint an owner login could grant themselves everything, so this is
// the one capability a tab list cannot hand over.

/**
 * @swagger
 * /api/fleet/team:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The delivery company's own portal logins
 */
router.get("/team", requireFleetTab("TEAM"), async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    // The team is the caller's companies, not the whole group: somebody scoped
    // to Marina administers Marina's logins and sees Marina's colleagues.
    const companyIds = await callerCompanyIds(req, ctx);
    const companies = await prisma.fleetPartner.findMany({
      where: { tenantId: ctx.tenantId, id: { in: companyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const users = await prisma.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        role: "FLEET",
        fleetPartnerId: { in: companyIds },
      },
      select: {
        id: true, email: true, name: true, phone: true,
        fleetRole: true, fleetTabs: true, fleetPartnerIds: true,
        fleetPartnerId: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      companies,
      users: users.map((u) => ({
        ...u,
        fleetRole: normaliseFleetRole(u.fleetRole),
        fleetTabs: parseFleetTabs(u.fleetTabs),
        effectiveTabs: effectiveFleetTabs(u.fleetRole, u.fleetTabs),
        // Null means every company in the group, which is what the page prints
        // rather than listing them all back at somebody who did not choose.
        fleetPartnerIds: parseFleetPartnerIds(u.fleetPartnerIds),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * The companies the CALLER may act for: their owner group, narrowed by their
 * own `fleetPartnerIds`.
 *
 * This is the same intersection `fleetContext` computes, and it exists because
 * the Team endpoints used to compute the group on their own without it. That
 * gap let an owner scoped to one company mint a login for a sibling company and
 * sign in as it — a fence that holds on reads and not on writes is not a fence.
 */
async function callerCompanyIds(
  req: Request,
  ctx: { tenantId: string; fleetPartnerId: string },
): Promise<string[]> {
  const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId ?? null;
  const group = await prisma.fleetPartner.findMany({
    where: ownerGroupId
      ? { tenantId: ctx.tenantId, ownerGroupId }
      : { tenantId: ctx.tenantId, id: ctx.fleetPartnerId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const scoped = fleetIdentityOf(req)?.partnerIds ?? null;
  const ids = scoped ? group.filter((g) => scoped.includes(g.id)) : group;
  // A caller whose scope resolves to nothing gets nothing, not everything.
  return ids.map((g) => g.id);
}

/**
 * The company-scope list an owner posted, validated against what the CALLER
 * may act for.
 *
 * `null` means "every company the caller has", and only an explicit null or a
 * full-house selection produces it. An empty result from a non-empty submission
 * is an error rather than null: a picker holding one stale id would otherwise
 * quietly grant the whole group instead of the one company that was meant.
 */
function readPartnerIdsInput(
  raw: unknown,
  allowedIds: string[],
): { value?: string[] | null; error?: string; absent?: true } {
  if (raw === undefined) return { absent: true };
  if (raw === null) return { value: null };
  if (!Array.isArray(raw)) return { absent: true };
  if (raw.length === 0) return { value: null };
  const chosen = allowedIds.filter((id) => raw.includes(id));
  if (chosen.length === 0) {
    return { error: "None of those companies are yours to assign" };
  }
  return { value: chosen.length === allowedIds.length ? null : chosen };
}

/**
 * @swagger
 * /api/fleet/team:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Add a portal login for this delivery company (OWNER only)
 */
router.post(
  "/team",
  requireFleetRole("OWNER"),
  requireFleetTab("TEAM"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId ?? null;
      const allowedIds = await callerCompanyIds(req, ctx);
      if (allowedIds.length === 0) {
        res.status(403).json({ error: "Your login is not scoped to any company" });
        return;
      }

      const { email, password, name, phone, fleetRole, fleetTabs, fleetPartnerIds } = req.body as {
        email?: string; password?: string; name?: string; phone?: string;
        fleetRole?: string; fleetTabs?: unknown; fleetPartnerIds?: unknown;
      };

      if (!name || name.trim().length < 2) {
        res.status(400).json({ error: "A name is required" }); return;
      }
      if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) {
        res.status(400).json({ error: "A valid email is required" }); return;
      }
      if (!password || password.length < 8) {
        res.status(400).json({ error: "The password must be at least 8 characters" }); return;
      }
      if (!isFleetPortalRole(fleetRole)) {
        res.status(400).json({ error: "Role must be OWNER, OPERATIONS or FINANCE" }); return;
      }

      const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (existing) { res.status(400).json({ error: "That email already has a login" }); return; }

      const parsedScope = readPartnerIdsInput(fleetPartnerIds, allowedIds);
      if (parsedScope.error) { res.status(400).json({ error: parsedScope.error }); return; }
      // A new login inherits the caller's own fence when they name no companies:
      // an owner of one company cannot create a colleague who reaches further
      // than they do.
      const callerScoped = fleetIdentityOf(req)?.partnerIds ?? null;
      const scoped = parsedScope.value ?? callerScoped ?? null;
      const tabs = readFleetTabsInput(fleetTabs);

      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: email.trim(),
          passwordHash: await bcrypt.hash(password, 12),
          name: name.trim(),
          phone: phone?.trim() || null,
          role: "FLEET",
          // The new login's home company is the one the owner is acting as, and
          // the group is what lets them switch — the same two fields every
          // fleet login has carried since revision 1.
          fleetPartnerId: scoped ? scoped[0] : ctx.fleetPartnerId,
          ownerGroupId,
          fleetRole,
          fleetTabs: tabs === undefined || tabs === null ? undefined : tabs,
          fleetPartnerIds: scoped ?? undefined,
        },
        select: {
          id: true, email: true, name: true, phone: true, fleetRole: true,
          fleetTabs: true, fleetPartnerIds: true, fleetPartnerId: true,
          isActive: true, createdAt: true,
        },
      });

      res.status(201).json({
        ...user,
        fleetRole: normaliseFleetRole(user.fleetRole),
        fleetTabs: parseFleetTabs(user.fleetTabs),
        effectiveTabs: effectiveFleetTabs(user.fleetRole, user.fleetTabs),
        fleetPartnerIds: parseFleetPartnerIds(user.fleetPartnerIds),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleet/team/{id}:
 *   patch:
 *     tags: [Fleet Portal]
 *     summary: Change what one login opens, or switch it off (OWNER only)
 */
router.patch(
  "/team/:id",
  requireFleetRole("OWNER"),
  requireFleetTab("TEAM"),
  async (req: Request, res: Response) => {
    try {
      const ctx = await fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      // An owner cannot narrow their own access: it would be a way to lock the
      // company out of the only screen that could undo it.
      if (req.params.id === req.user!.userId) {
        res.status(400).json({ error: "You cannot change your own access" });
        return;
      }

      const allowedIds = await callerCompanyIds(req, ctx);
      if (allowedIds.length === 0) {
        res.status(403).json({ error: "Your login is not scoped to any company" });
        return;
      }

      // Scoped to what the caller may act for, so somebody who administers one
      // company cannot edit a sibling company's login.
      const target = await prisma.user.findFirst({
        where: {
          id: req.params.id,
          tenantId: ctx.tenantId,
          role: "FLEET",
          fleetPartnerId: { in: allowedIds },
        },
        select: { id: true },
      });
      if (!target) { res.status(404).json({ error: "That login is not on your team" }); return; }

      const data: Record<string, unknown> = {};
      if (typeof req.body.name === "string" && req.body.name.trim()) {
        data.name = req.body.name.trim();
      }
      if (typeof req.body.phone === "string") data.phone = req.body.phone.trim() || null;
      if (typeof req.body.isActive === "boolean") data.isActive = req.body.isActive;
      if (req.body.fleetRole !== undefined) {
        if (!isFleetPortalRole(req.body.fleetRole)) {
          res.status(400).json({ error: "Role must be OWNER, OPERATIONS or FINANCE" });
          return;
        }
        data.fleetRole = req.body.fleetRole;
      }
      if ("fleetTabs" in req.body) {
        const tabs = readFleetTabsInput(req.body.fleetTabs);
        // Prisma.DbNull, not null: a JSON column needs the database null to
        // clear an override back to "inherit the role".
        if (tabs !== undefined) data.fleetTabs = tabs === null ? Prisma.DbNull : tabs;
      }
      if ("fleetPartnerIds" in req.body) {
        const parsedScope = readPartnerIdsInput(req.body.fleetPartnerIds, allowedIds);
        if (parsedScope.error) { res.status(400).json({ error: parsedScope.error }); return; }
        if (!parsedScope.absent) {
          // "All companies" from a scoped caller means all of THEIR companies,
          // never the group's.
          const scoped = parsedScope.value ?? fleetIdentityOf(req)?.partnerIds ?? null;
          data.fleetPartnerIds = scoped === null ? Prisma.DbNull : scoped;
          if (scoped) data.fleetPartnerId = scoped[0];
        }
      }
      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: "Nothing to change" });
        return;
      }

      const user = await prisma.user.update({
        where: { id: target.id },
        data,
        select: {
          id: true, email: true, name: true, phone: true, fleetRole: true,
          fleetTabs: true, fleetPartnerIds: true, fleetPartnerId: true,
          isActive: true, createdAt: true,
        },
      });

      res.json({
        ...user,
        fleetRole: normaliseFleetRole(user.fleetRole),
        fleetTabs: parseFleetTabs(user.fleetTabs),
        effectiveTabs: effectiveFleetTabs(user.fleetRole, user.fleetTabs),
        fleetPartnerIds: parseFleetPartnerIds(user.fleetPartnerIds),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

export default router;
