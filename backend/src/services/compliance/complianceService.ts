/**
 * Revision 20 — the compliance desk.
 *
 * Client note, 2026-09-15: documents get reviewed, renewals get chased, and
 * accounts get frozen when the paper lapses. All three already had storage and
 * none of them had a desk: a driver's civil ID was reviewed from inside the
 * delivery company's own request, a merchant's trade licence had nowhere to
 * live at all, and "freeze them until they send it" was a WhatsApp message.
 *
 * Three rules this file keeps:
 *
 *   1. Approval writes THROUGH to the read model. `Driver.<doc>Expiry` /
 *      `<doc>Status` stay the columns the roster, the profile and the alerts
 *      read, exactly as revision 12 established. A document that reads VALID
 *      while the driver row says MISSING is the bug this prevents.
 *   2. Every decision is a status-guarded `updateMany` claim, count 0 = 409.
 *      Two compliance officers pressing approve on the same scan is the
 *      ordinary case on a shared queue, not a rare race.
 *   3. A freeze says why. `Driver.isFrozen` is what dispatch reads and it has
 *      always been a bare boolean; a driver told "you are frozen" with nobody
 *      able to name the document is a driver who phones the desk, which is the
 *      work this screen exists to remove.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import {
  COMPANY_DOC_TYPES,
  DRIVER_DOC_COLUMNS,
  EXPIRY_WARNING_DAYS,
  applyDriverDocToDriver,
  deriveDocHealth,
  isCompanyDocType,
  isDriverDocType,
} from "../fleet/fleetDocumentService";
import { runAutoCheck, type AutoCheckInput } from "./documentAutoCheck";

export type DocScope = "DRIVER" | "COMPANY" | "VENDOR";
export type FreezeTarget = "DRIVER" | "FLEET" | "VENDOR";

/**
 * A merchant's own paper. Kept separate from COMPANY_DOC_TYPES (which is a
 * delivery company's) because the two lists genuinely differ: a pharmacy has a
 * pharmacy licence and no civil insurance for drivers it does not employ.
 */
export const VENDOR_DOC_TYPES = [
  "TRADE_LICENSE",
  "COMMERCIAL_REG",
  "VAT_CERT",
  "MUNICIPALITY_LICENSE",
  "PHARMACY_LICENSE",
  "AUTHORISED_SIGNATORY",
] as const;
export type VendorDocType = (typeof VENDOR_DOC_TYPES)[number];

export function isVendorDocType(t: string): t is VendorDocType {
  return (VENDOR_DOC_TYPES as readonly string[]).includes(t);
}

/** The catalogue a scope may talk about, for the request-a-document form. */
export function docTypesFor(scope: DocScope): string[] {
  if (scope === "DRIVER") return Object.keys(DRIVER_DOC_COLUMNS);
  if (scope === "COMPANY") return [...COMPANY_DOC_TYPES];
  return [...VENDOR_DOC_TYPES];
}

/** Which scope a stored row belongs to, read off the row rather than guessed. */
export function scopeOf(doc: { driverId: string | null; vendorId: string | null }): DocScope {
  if (doc.driverId) return "DRIVER";
  if (doc.vendorId) return "VENDOR";
  return "COMPANY";
}

// ─── The automatic first pass ───────────────────────────────────────────────

/**
 * Run the auto-check for a document that is already stored and write the
 * verdict onto the row.
 *
 * Separate from the upload path on purpose: the desk can re-run it after an
 * expiry date is corrected, and the nightly sweep re-runs it on everything
 * still waiting, so a document uploaded in January and reviewed in March is
 * flagged for the expiry it has now rather than the one it had then.
 */
export async function autoCheckDocument(tenantId: string, documentId: string) {
  const doc = await prisma.fleetDocument.findFirst({
    where: { id: documentId, tenantId },
    select: {
      id: true,
      type: true,
      fileKey: true,
      mimeType: true,
      sizeBytes: true,
      expiryDate: true,
      driverId: true,
      vendorId: true,
      fleetPartnerId: true,
      fileData: false,
      status: true,
    },
  });
  if (!doc) return null;

  const scope = scopeOf(doc);
  // `fileData` is never selected in a list query (the bytes are large and the
  // model says so), so "is there a file" is asked with a count instead.
  const withBytes = await prisma.fleetDocument.count({
    where: { id: documentId, tenantId, OR: [{ fileKey: { not: null } }, { NOT: { fileData: null } }] },
  });
  const duplicatePending = await prisma.fleetDocument.count({
    where: {
      tenantId,
      type: doc.type,
      id: { not: doc.id },
      status: "PENDING_REVIEW",
      ...(doc.driverId
        ? { driverId: doc.driverId }
        : doc.vendorId
          ? { vendorId: doc.vendorId }
          : { fleetPartnerId: doc.fleetPartnerId, driverId: null }),
    },
  });

  const input: AutoCheckInput = {
    type: doc.type,
    hasFile: withBytes > 0,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    expiryDate: doc.expiryDate,
    duplicatePending: duplicatePending > 0,
    scope,
  };
  const result = runAutoCheck(input);

  await prisma.fleetDocument.update({
    where: { id: doc.id },
    data: {
      autoCheck: result.verdict,
      autoCheckNotes: result.notes as unknown as Prisma.InputJsonValue,
    },
  });
  return result;
}

// ─── The review queue ───────────────────────────────────────────────────────

export interface ListDocsParams {
  tenantId: string;
  scope?: DocScope;
  status?: string;
  /** Only documents the auto pass flagged, which is where the desk starts. */
  flaggedOnly?: boolean;
  fleetPartnerId?: string;
  vendorId?: string;
  driverId?: string;
  q?: string;
  skip?: number;
  take?: number;
}

/** Everything the review screen draws for one row. */
export async function listDocuments(params: ListDocsParams) {
  const { tenantId } = params;
  const where: Prisma.FleetDocumentWhereInput = { tenantId };

  if (params.scope === "DRIVER") where.driverId = { not: null };
  if (params.scope === "COMPANY") {
    where.driverId = null;
    where.vendorId = null;
    where.fleetPartnerId = { not: null };
  }
  if (params.scope === "VENDOR") where.vendorId = { not: null };

  if (params.status) where.status = params.status as never;
  if (params.flaggedOnly) where.autoCheck = "FLAG";
  if (params.fleetPartnerId) where.fleetPartnerId = params.fleetPartnerId;
  if (params.vendorId) where.vendorId = params.vendorId;
  if (params.driverId) where.driverId = params.driverId;
  if (params.q) {
    const q = params.q.trim();
    where.OR = [
      { type: { contains: q, mode: "insensitive" } },
      { fileName: { contains: q, mode: "insensitive" } },
      { driver: { name: { contains: q, mode: "insensitive" } } },
      { driver: { driverCode: { contains: q, mode: "insensitive" } } },
      { fleet: { name: { contains: q, mode: "insensitive" } } },
      { vendor: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.fleetDocument.count({ where }),
    prisma.fleetDocument.findMany({
      where,
      // REQUESTED first (nobody has answered the desk), then what is waiting.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      select: {
        id: true,
        type: true,
        status: true,
        autoCheck: true,
        autoCheckNotes: true,
        expiryDate: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        rejectionReason: true,
        requestNote: true,
        reviewedAt: true,
        createdAt: true,
        driver: { select: { id: true, name: true, driverCode: true, phone: true, isFrozen: true } },
        fleet: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      scope: r.driver ? "DRIVER" : r.vendor ? "VENDOR" : "COMPANY",
      // A file exists when there is a key; inline bytes are never selected
      // here, so the flag is computed from what a list query may safely know.
      hasFile: Boolean(r.fileKey) || Boolean(r.sizeBytes),
      health: deriveDocHealth(r.expiryDate),
    })),
  };
}

// ─── Decisions ──────────────────────────────────────────────────────────────

/**
 * Approve one document.
 *
 * Supersedes any earlier live document of the same type for the same owner and
 * writes an approved driver document through to the `Driver` columns, inside
 * one transaction — the same discipline `approveFleetRequest` uses, because a
 * document approved on this screen and one approved through a fleet request
 * must leave the database in the same state.
 */
export async function approveDocument(params: {
  tenantId: string;
  documentId: string;
  reviewerId: string;
  /** The desk may correct a mistyped expiry as it approves. */
  expiryDate?: Date | null;
}) {
  const { tenantId, documentId, reviewerId } = params;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.fleetDocument.updateMany({
      where: { id: documentId, tenantId, status: { in: ["PENDING_REVIEW", "REJECTED", "EXPIRED"] } },
      data: {
        status: "VALID",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: null,
        ...(params.expiryDate !== undefined ? { expiryDate: params.expiryDate } : {}),
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("Document is not awaiting a decision"), { statusCode: 409 });
    }

    const doc = await tx.fleetDocument.findFirstOrThrow({
      where: { id: documentId, tenantId },
      select: {
        id: true,
        type: true,
        expiryDate: true,
        driverId: true,
        vendorId: true,
        fleetPartnerId: true,
      },
    });

    await tx.fleetDocument.updateMany({
      where: {
        tenantId,
        type: doc.type,
        id: { not: doc.id },
        status: { in: ["VALID", "PENDING_REVIEW"] },
        ...(doc.driverId
          ? { driverId: doc.driverId }
          : doc.vendorId
            ? { vendorId: doc.vendorId, driverId: null }
            : { fleetPartnerId: doc.fleetPartnerId, driverId: null, vendorId: null }),
      },
      data: { status: "SUPERSEDED", supersededById: doc.id },
    });

    if (doc.driverId) {
      await applyDriverDocToDriver(tx, doc.driverId, doc.type, doc.expiryDate);
    }
    return doc;
  });
}

/** Reject one document. The reason is required and is shown verbatim. */
export async function rejectDocument(params: {
  tenantId: string;
  documentId: string;
  reviewerId: string;
  reason: string;
}) {
  const claimed = await prisma.fleetDocument.updateMany({
    where: {
      id: params.documentId,
      tenantId: params.tenantId,
      status: { in: ["PENDING_REVIEW", "VALID", "EXPIRED"] },
    },
    data: {
      status: "REJECTED",
      rejectionReason: params.reason,
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw Object.assign(new Error("Document is not awaiting a decision"), { statusCode: 409 });
  }
  return prisma.fleetDocument.findFirst({ where: { id: params.documentId, tenantId: params.tenantId } });
}

/**
 * Ask for a document that does not exist yet.
 *
 * The ask IS a row, in REQUESTED. That is what makes it answerable: the fleet
 * portal's Documents tab and the merchant's Settings screen both already list
 * this table, so the request appears exactly where the upload will land, and
 * the upload that answers it updates the same row rather than arriving as an
 * unrelated file somebody has to match up by eye.
 */
export async function requestDocument(params: {
  tenantId: string;
  scope: DocScope;
  type: string;
  note?: string | null;
  requestedById: string;
  driverId?: string | null;
  fleetPartnerId?: string | null;
  vendorId?: string | null;
  expiryDate?: Date | null;
}) {
  const { tenantId, scope, type } = params;

  const known =
    scope === "DRIVER"
      ? isDriverDocType(type)
      : scope === "COMPANY"
        ? isCompanyDocType(type)
        : isVendorDocType(type);
  if (!known) {
    throw Object.assign(new Error(`${type} is not a ${scope.toLowerCase()} document type`), {
      statusCode: 400,
    });
  }

  // A driver document needs the company behind the driver, because that is who
  // will be asked to produce it.
  let fleetPartnerId = params.fleetPartnerId ?? null;
  if (scope === "DRIVER") {
    if (!params.driverId) {
      throw Object.assign(new Error("driverId is required for a driver document"), { statusCode: 400 });
    }
    const driver = await prisma.driver.findFirst({
      where: { id: params.driverId, tenantId },
      select: { fleetPartnerId: true },
    });
    if (!driver) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });
    fleetPartnerId = driver.fleetPartnerId ?? fleetPartnerId;
  }
  if (scope === "COMPANY" && !fleetPartnerId) {
    throw Object.assign(new Error("fleetPartnerId is required for a company document"), {
      statusCode: 400,
    });
  }
  if (scope === "VENDOR" && !params.vendorId) {
    throw Object.assign(new Error("vendorId is required for a merchant document"), { statusCode: 400 });
  }

  // Asking twice for the same thing is the desk's own duplicate, not the
  // account's. One open ask per owner per type.
  const existing = await prisma.fleetDocument.findFirst({
    where: {
      tenantId,
      type,
      status: "REQUESTED",
      ...(scope === "DRIVER"
        ? { driverId: params.driverId! }
        : scope === "VENDOR"
          ? { vendorId: params.vendorId! }
          : { fleetPartnerId, driverId: null, vendorId: null }),
    },
    select: { id: true },
  });
  if (existing) {
    throw Object.assign(new Error("That document has already been requested"), { statusCode: 409 });
  }

  return prisma.fleetDocument.create({
    data: {
      tenantId,
      type,
      status: "REQUESTED",
      requestedById: params.requestedById,
      requestNote: params.note ?? null,
      expiryDate: params.expiryDate ?? null,
      ...(scope === "DRIVER" ? { driverId: params.driverId!, fleetPartnerId } : {}),
      ...(scope === "COMPANY" ? { fleetPartnerId } : {}),
      ...(scope === "VENDOR" ? { vendorId: params.vendorId! } : {}),
    },
  });
}

// ─── The renewal schedule ───────────────────────────────────────────────────

export interface RenewalRow {
  documentId: string | null;
  scope: DocScope;
  type: string;
  expiryDate: string | null;
  health: string;
  daysLeft: number | null;
  ownerId: string;
  ownerName: string;
  ownerRef: string | null;
  /** The delivery company a driver belongs to, so the desk knows who to call. */
  fleetPartnerId: string | null;
  fleetPartnerName: string | null;
  frozen: boolean;
}

/**
 * Everything that has expired or is about to, across drivers, delivery
 * companies and merchants, in one list.
 *
 * Driver rows are built from the `Driver.<doc>Expiry` columns rather than from
 * `FleetDocument`, because those columns ARE the read model — a driver whose
 * civil ID was recorded before the portal existed has an expiry and no
 * document row, and a renewal schedule that cannot see them is a renewal
 * schedule that misses the oldest drivers on the network.
 */
export async function renewalSchedule(params: {
  tenantId: string;
  /** How far ahead to look. The default is the warning window. */
  withinDays?: number;
  scope?: DocScope;
  includeExpired?: boolean;
}): Promise<RenewalRow[]> {
  const { tenantId } = params;
  const withinDays = params.withinDays ?? EXPIRY_WARNING_DAYS;
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 86_400_000);
  const includeExpired = params.includeExpired !== false;

  const rows: RenewalRow[] = [];
  const daysLeft = (d: Date | null) =>
    d === null ? null : Math.floor((d.getTime() - now.getTime()) / 86_400_000);

  // ── Drivers, from the read-model columns ───────────────────────────────
  if (!params.scope || params.scope === "DRIVER") {
    const drivers = await prisma.driver.findMany({
      where: { tenantId, status: { notIn: ["TERMINATED"] } },
      select: {
        id: true,
        name: true,
        driverCode: true,
        isFrozen: true,
        fleetPartnerId: true,
        fleetPartner: { select: { id: true, name: true } },
        ...Object.fromEntries(
          Object.values(DRIVER_DOC_COLUMNS).map((c) => [c.expiry, true]),
        ),
      } as never,
    });
    for (const d of drivers as unknown as Array<Record<string, unknown>>) {
      for (const [type, cols] of Object.entries(DRIVER_DOC_COLUMNS)) {
        // The selfie has no expiry of its own and never renews.
        if (type === "DRIVER_SELFIE") continue;
        const expiry = (d[cols.expiry] as Date | null) ?? null;
        if (!expiry) continue;
        const expired = expiry.getTime() < now.getTime();
        if (expired && !includeExpired) continue;
        if (!expired && expiry.getTime() > horizon.getTime()) continue;
        const fleet = d.fleetPartner as { id: string; name: string } | null;
        rows.push({
          documentId: null,
          scope: "DRIVER",
          type,
          expiryDate: expiry.toISOString(),
          health: deriveDocHealth(expiry, now),
          daysLeft: daysLeft(expiry),
          ownerId: d.id as string,
          ownerName: d.name as string,
          ownerRef: (d.driverCode as string | null) ?? null,
          fleetPartnerId: fleet?.id ?? null,
          fleetPartnerName: fleet?.name ?? null,
          frozen: Boolean(d.isFrozen),
        });
      }
    }
  }

  // ── Delivery companies and merchants, from the document rows ───────────
  const ownerScopes: DocScope[] = params.scope
    ? params.scope === "DRIVER"
      ? []
      : [params.scope]
    : ["COMPANY", "VENDOR"];

  if (ownerScopes.length) {
    const docs = await prisma.fleetDocument.findMany({
      where: {
        tenantId,
        status: { in: ["VALID", "EXPIRED"] },
        expiryDate: includeExpired ? { lte: horizon } : { gte: now, lte: horizon },
        OR: [
          ...(ownerScopes.includes("COMPANY")
            ? [{ driverId: null, vendorId: null, fleetPartnerId: { not: null } }]
            : []),
          ...(ownerScopes.includes("VENDOR") ? [{ vendorId: { not: null } }] : []),
        ] as never,
      },
      select: {
        id: true,
        type: true,
        expiryDate: true,
        driverId: true,
        vendorId: true,
        fleet: { select: { id: true, name: true, complianceFrozenAt: true } },
        vendor: { select: { id: true, name: true, code: true, complianceFrozenAt: true } },
      },
    });
    for (const doc of docs) {
      const isVendor = Boolean(doc.vendorId);
      const owner = isVendor ? doc.vendor : doc.fleet;
      if (!owner) continue;
      rows.push({
        documentId: doc.id,
        scope: isVendor ? "VENDOR" : "COMPANY",
        type: doc.type,
        expiryDate: doc.expiryDate?.toISOString() ?? null,
        health: deriveDocHealth(doc.expiryDate, now),
        daysLeft: daysLeft(doc.expiryDate),
        ownerId: owner.id,
        ownerName: owner.name,
        ownerRef: isVendor ? ((doc.vendor?.code as string | null) ?? null) : null,
        fleetPartnerId: isVendor ? null : owner.id,
        fleetPartnerName: isVendor ? null : owner.name,
        frozen: Boolean((owner as { complianceFrozenAt: Date | null }).complianceFrozenAt),
      });
    }
  }

  // Worst first: what has already lapsed, then what lapses soonest.
  rows.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  return rows;
}

// ─── Freezing ───────────────────────────────────────────────────────────────

/**
 * Freeze or unfreeze an account for a compliance reason.
 *
 * A driver freeze sets the existing `isFrozen`, because that is the flag
 * dispatch already reads — inventing a second one would have meant a driver
 * who is compliance-frozen and still receiving offers. The `complianceFrozenAt`
 * pair beside it is the reason, which the boolean never carried.
 *
 * A merchant or delivery-company freeze is deliberately NOT `isPaused` /
 * `isActive`: those are operational switches their own people can work, and a
 * shop must not be able to lift a compliance freeze by un-pausing itself.
 */
export async function setComplianceFreeze(params: {
  tenantId: string;
  target: FreezeTarget;
  id: string;
  frozen: boolean;
  reason?: string | null;
}) {
  const { tenantId, target, id, frozen } = params;
  if (frozen && !params.reason?.trim()) {
    throw Object.assign(new Error("A freeze needs a reason"), { statusCode: 400 });
  }
  const stamp = frozen
    ? { complianceFrozenAt: new Date(), complianceFreezeReason: params.reason!.trim() }
    : { complianceFrozenAt: null, complianceFreezeReason: null };

  if (target === "DRIVER") {
    const claimed = await prisma.driver.updateMany({
      where: { id, tenantId },
      data: { ...stamp, isFrozen: frozen },
    });
    if (claimed.count === 0) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });
    return prisma.driver.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, isFrozen: true, complianceFrozenAt: true, complianceFreezeReason: true },
    });
  }
  if (target === "FLEET") {
    const claimed = await prisma.fleetPartner.updateMany({ where: { id, tenantId }, data: stamp });
    if (claimed.count === 0) throw Object.assign(new Error("Company not found"), { statusCode: 404 });
    return prisma.fleetPartner.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, complianceFrozenAt: true, complianceFreezeReason: true },
    });
  }
  const claimed = await prisma.vendor.updateMany({ where: { id, tenantId }, data: stamp });
  if (claimed.count === 0) throw Object.assign(new Error("Shop not found"), { statusCode: 404 });
  return prisma.vendor.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, complianceFrozenAt: true, complianceFreezeReason: true },
  });
}

/**
 * Mark every live document whose expiry has passed as EXPIRED, and re-derive
 * the driver read-model columns with it.
 *
 * Run from the nightly cron. Without it a document sits reading VALID forever
 * with a date in the past, and the renewal schedule is the only place anybody
 * would notice.
 */
export async function sweepExpiredDocuments(tenantId: string, now = new Date()) {
  const due = await prisma.fleetDocument.findMany({
    where: { tenantId, status: "VALID", expiryDate: { lt: now } },
    select: { id: true, type: true, driverId: true, expiryDate: true },
  });
  if (!due.length) return { expired: 0 };

  await prisma.fleetDocument.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { status: "EXPIRED" },
  });
  for (const doc of due) {
    if (doc.driverId) {
      await applyDriverDocToDriver(prisma, doc.driverId, doc.type, doc.expiryDate);
    }
  }
  return { expired: due.length };
}

/** Counts for the Compliance rail badge and the tab strip. */
export async function complianceCounts(tenantId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const [driverPending, companyPending, vendorPending, expiring, expired] = await Promise.all([
    prisma.fleetDocument.count({ where: { tenantId, status: "PENDING_REVIEW", driverId: { not: null } } }),
    prisma.fleetDocument.count({
      where: { tenantId, status: "PENDING_REVIEW", driverId: null, vendorId: null },
    }),
    prisma.fleetDocument.count({ where: { tenantId, status: "PENDING_REVIEW", vendorId: { not: null } } }),
    prisma.fleetDocument.count({
      where: { tenantId, status: "VALID", expiryDate: { gte: now, lte: horizon } },
    }),
    prisma.fleetDocument.count({ where: { tenantId, status: { in: ["EXPIRED"] } } }),
  ]);
  return {
    driverPending,
    companyPending,
    vendorPending,
    pending: driverPending + companyPending + vendorPending,
    expiring,
    expired,
  };
}
