/**
 * Revision 12 — the fleet portal's request desk.
 *
 * THE RULE: the fleet portal never writes a live record. Every change a
 * delivery company wants is a `FleetChangeRequest`, and Darb's approval is what
 * mutates anything real. A subcontractor putting an undocumented driver on
 * Darb's road without Darb seeing the documents is the failure this prevents.
 *
 * One exception, decided by the client: the driver's phone number writes
 * through directly. It lives in the route, not here, because it is not a
 * request at all.
 *
 * A pending driver has NO `Driver` row. Approval creates it. That is what stops
 * a rejected submission leaving a half-driver in the dispatch candidate pool,
 * and it keeps `Driver.status` meaning exactly what it has always meant.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { createViolationNotifications } from "../notificationService";
import { applyDriverDocToDriver } from "./fleetDocumentService";

export type FleetRequestType =
  | "DRIVER_ONBOARD"
  | "DRIVER_STATUS"
  | "DRIVER_PROFILE"
  | "DRIVER_DOCUMENT"
  | "COMPANY_DOCUMENT";

/** The driver statuses a delivery company may ask Darb for. */
export const REQUESTABLE_STATUSES = ["ACTIVE", "LEAVE", "TERMINATED"] as const;
export type RequestableStatus = (typeof REQUESTABLE_STATUSES)[number];

const TYPE_LABELS: Record<FleetRequestType, string> = {
  DRIVER_ONBOARD: "New driver",
  DRIVER_STATUS: "Driver status change",
  DRIVER_PROFILE: "Driver details change",
  DRIVER_DOCUMENT: "Driver document",
  COMPANY_DOCUMENT: "Company document",
};

/**
 * Raise a request and tell Darb about it. The notification is not decoration:
 * a review queue nobody is told about is worse than no queue, because the
 * delivery company now believes somebody is looking.
 */
export async function createFleetRequest(params: {
  tenantId: string;
  fleetPartnerId: string;
  type: FleetRequestType;
  driverId?: string | null;
  payload: Prisma.InputJsonValue;
  documentIds?: string[];
  requestedById?: string | null;
  fleetName?: string | null;
}) {
  const request = await prisma.fleetChangeRequest.create({
    data: {
      tenantId: params.tenantId,
      fleetPartnerId: params.fleetPartnerId,
      type: params.type,
      driverId: params.driverId ?? null,
      payload: params.payload,
      documentIds: params.documentIds ?? [],
      requestedById: params.requestedById ?? null,
    },
  });

  try {
    await createViolationNotifications({
      tenantId: params.tenantId,
      eventType: "FLEET_REQUEST_SUBMITTED",
      severity: params.type === "DRIVER_STATUS" ? "HIGH" : "MEDIUM",
      title: "Fleet request waiting on review",
      message: `${params.fleetName ?? "A delivery company"} submitted: ${TYPE_LABELS[params.type]}`,
      sourceId: request.id,
      metadata: { requestId: request.id, type: params.type },
    });
  } catch {
    // A notification failure must not lose the request itself. The /fleets
    // pending count is the backstop that makes this survivable.
  }

  return request;
}

/**
 * The Darb-issued driver identifier ("DRB-0001"). Finance searches remittances
 * by this, so a fleet-onboarded driver has to get one or they are invisible to
 * the people who pay for them.
 */
async function nextDriverCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const count = await tx.driver.count({ where: { tenantId } });
  for (let i = 1; i <= 20; i++) {
    const code = `DRB-${String(count + i).padStart(4, "0")}`;
    const clash = await tx.driver.findFirst({
      where: { tenantId, driverCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  // Never block an approval on a cosmetic identifier.
  return `DRB-${Date.now().toString().slice(-6)}`;
}

export interface ApprovalResult {
  requestId: string;
  driverId: string | null;
  created: boolean;
}

/**
 * Approve a request and apply it, in one transaction. Everything a request
 * promises has to land together: a document that reads VALID while the driver
 * row still says MISSING is worse than either alone, because the two screens
 * that disagree are both believed.
 */
export async function approveFleetRequest(params: {
  tenantId: string;
  requestId: string;
  reviewerId: string;
  note?: string | null;
}): Promise<ApprovalResult> {
  const { tenantId, requestId, reviewerId } = params;

  return prisma.$transaction(async (tx) => {
    // Status-guarded claim: two ops users hitting approve at once must not
    // apply the change twice. Same discipline as the order state machine.
    const claimed = await tx.fleetChangeRequest.updateMany({
      where: { id: requestId, tenantId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.note ?? null,
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("Request is not pending"), { statusCode: 409 });
    }

    const request = await tx.fleetChangeRequest.findFirstOrThrow({
      where: { id: requestId, tenantId },
    });
    const payload = (request.payload ?? {}) as Record<string, any>;
    let driverId = request.driverId;
    let created = false;

    if (request.type === "DRIVER_ONBOARD") {
      // `companyId` and `platform` are legacy-required columns. Inherit them
      // from a driver this fleet already has so a multi-company tenant keeps
      // its grouping; fall back to the tenant's own first company.
      const sibling = await tx.driver.findFirst({
        where: { tenantId, fleetPartnerId: request.fleetPartnerId },
        select: { companyId: true, platform: true },
      });
      const companyId =
        sibling?.companyId ??
        (
          await tx.company.findFirstOrThrow({
            where: { tenantId },
            select: { id: true },
          })
        ).id;

      const driver = await tx.driver.create({
        data: {
          tenantId,
          companyId,
          fleetPartnerId: request.fleetPartnerId,
          name: String(payload.name ?? "").trim(),
          phone: String(payload.phone ?? "").trim(),
          platform: sibling?.platform ?? "DARB",
          vehicleType: payload.vehicleType === "CAR" ? "CAR" : "MOTORCYCLE",
          zone: payload.zone ?? null,
          hireDate: payload.hireDate ? new Date(payload.hireDate) : new Date(),
          status: "ACTIVE",
          driverCode: await nextDriverCode(tx, tenantId),
        },
      });
      driverId = driver.id;
      created = true;

      await tx.fleetChangeRequest.update({
        where: { id: request.id },
        data: { driverId },
      });
    }

    if (request.type === "DRIVER_STATUS" && driverId) {
      const status = payload.status as RequestableStatus;
      if ((REQUESTABLE_STATUSES as readonly string[]).includes(status)) {
        await tx.driver.update({ where: { id: driverId }, data: { status } });
      }
    }

    if (request.type === "DRIVER_PROFILE" && driverId) {
      const data: Record<string, unknown> = {};
      if (typeof payload.name === "string" && payload.name.trim()) data.name = payload.name.trim();
      if (payload.vehicleType === "CAR" || payload.vehicleType === "MOTORCYCLE") {
        data.vehicleType = payload.vehicleType;
      }
      if (typeof payload.zone === "string") data.zone = payload.zone;
      if (Object.keys(data).length > 0) {
        await tx.driver.update({ where: { id: driverId }, data });
      }
    }

    // Documents ride along with every request type, not just the document
    // ones: an onboarding carries the civil ID that justified approving it.
    if (request.documentIds.length > 0) {
      const docs = await tx.fleetDocument.findMany({
        where: { tenantId, id: { in: request.documentIds } },
        select: { id: true, type: true, expiryDate: true, driverId: true },
      });

      for (const doc of docs) {
        const targetDriverId = doc.driverId ?? driverId;

        // A newer approved document of the same type supersedes the old one.
        // Nothing is deleted: what a fleet showed Darb, and when, is the point.
        await tx.fleetDocument.updateMany({
          where: {
            tenantId,
            type: doc.type,
            id: { not: doc.id },
            status: { in: ["VALID", "PENDING_REVIEW"] },
            ...(targetDriverId
              ? { driverId: targetDriverId }
              : { fleetPartnerId: request.fleetPartnerId, driverId: null }),
          },
          data: { status: "SUPERSEDED", supersededById: doc.id },
        });

        await tx.fleetDocument.update({
          where: { id: doc.id },
          data: {
            status: "VALID",
            driverId: targetDriverId ?? null,
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            rejectionReason: null,
          },
        });

        if (targetDriverId) {
          await applyDriverDocToDriver(tx, targetDriverId, doc.type, doc.expiryDate);
        }
      }
    }

    return { requestId: request.id, driverId, created };
  });
}

/**
 * Reject a request. The reason is required and is shown to the delivery
 * company verbatim: "rejected" with no reason is a phone call Darb has to take
 * anyway, which is the work this feature exists to remove.
 */
export async function rejectFleetRequest(params: {
  tenantId: string;
  requestId: string;
  reviewerId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.fleetChangeRequest.updateMany({
      where: { id: params.requestId, tenantId: params.tenantId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.reason,
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("Request is not pending"), { statusCode: 409 });
    }

    const request = await tx.fleetChangeRequest.findFirstOrThrow({
      where: { id: params.requestId, tenantId: params.tenantId },
    });
    if (request.documentIds.length > 0) {
      await tx.fleetDocument.updateMany({
        where: { tenantId: params.tenantId, id: { in: request.documentIds } },
        data: { status: "REJECTED", rejectionReason: params.reason },
      });
    }
    return request;
  });
}
