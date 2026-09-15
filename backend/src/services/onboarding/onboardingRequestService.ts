/**
 * Revision 20 — new merchant and delivery-company leads.
 *
 * Client note, 2026-09-15: "this tab is for the sales team to add the requests
 * to create new vendor accounts or delivery companies accounts".
 *
 * The operative word is *requests*. A sales rep is not an ops manager: they
 * should be able to put a signed pharmacy into the system from the car park
 * without holding the permission to write a live `Vendor` row, a merchant code
 * that collides with an existing one, or a delivery company with a per-order
 * rate nobody agreed. So this is a review queue, and APPROVAL is what creates
 * the account — the same discipline the fleet portal's request desk uses, for
 * the same reason: a rejected lead must not leave half an account behind.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";

export type OnboardingType = "VENDOR" | "FLEET";

/** Merchant codes are what order numbers are built from: A-Z and 0-9, short. */
const CODE_RE = /^[A-Z0-9]{2,8}$/;

/**
 * Derive a merchant code from a name when the rep did not give one. Advisory:
 * the reviewer sees it in the form and can change it before approving, and the
 * uniqueness check runs at approval either way.
 */
export function suggestVendorCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 4) || "SHOP";
}

export async function createOnboardingRequest(params: {
  tenantId: string;
  type: OnboardingType;
  companyName: string;
  companyNameAr?: string | null;
  code?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  details?: Prisma.InputJsonValue;
  createdById?: string | null;
}) {
  const companyName = params.companyName?.trim();
  if (!companyName) {
    throw Object.assign(new Error("A company name is required"), { statusCode: 400 });
  }
  const code = params.code?.trim().toUpperCase() || null;
  if (code && !CODE_RE.test(code)) {
    throw Object.assign(new Error("Code must be 2 to 8 letters or digits"), { statusCode: 400 });
  }

  return prisma.onboardingRequest.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      companyName,
      companyNameAr: params.companyNameAr?.trim() || null,
      code: params.type === "VENDOR" ? (code ?? suggestVendorCode(companyName)) : null,
      contactName: params.contactName?.trim() || null,
      contactPhone: params.contactPhone?.trim() || null,
      contactEmail: params.contactEmail?.trim() || null,
      notes: params.notes?.trim() || null,
      ...(params.details !== undefined ? { details: params.details } : {}),
      createdById: params.createdById ?? null,
    },
  });
}

export async function listOnboardingRequests(params: {
  tenantId: string;
  status?: string;
  type?: OnboardingType;
  q?: string;
  take?: number;
}) {
  const where: Prisma.OnboardingRequestWhereInput = { tenantId: params.tenantId };
  if (params.status) where.status = params.status as never;
  if (params.type) where.type = params.type;
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { contactPhone: { contains: q } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }
  return prisma.onboardingRequest.findMany({
    where,
    // NEW first: the queue is read top-down and a lead nobody has touched is
    // the one that goes cold.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: params.take ?? 100,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}

/** Move a lead into review, so two people do not both phone the merchant. */
export async function markOnboardingInReview(tenantId: string, id: string, reviewerId: string) {
  const claimed = await prisma.onboardingRequest.updateMany({
    where: { id, tenantId, status: "NEW" },
    data: { status: "IN_REVIEW", reviewedById: reviewerId },
  });
  if (claimed.count === 0) {
    throw Object.assign(new Error("Request is not new"), { statusCode: 409 });
  }
  return prisma.onboardingRequest.findFirst({ where: { id, tenantId } });
}

/** The sales rep can still correct a lead while nobody has decided on it. */
export async function updateOnboardingRequest(params: {
  tenantId: string;
  id: string;
  patch: {
    companyName?: string;
    companyNameAr?: string | null;
    code?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    notes?: string | null;
    details?: Prisma.InputJsonValue;
  };
}) {
  const row = await prisma.onboardingRequest.findFirst({
    where: { id: params.id, tenantId: params.tenantId },
    select: { status: true },
  });
  if (!row) throw Object.assign(new Error("Request not found"), { statusCode: 404 });
  if (row.status === "APPROVED" || row.status === "REJECTED") {
    throw Object.assign(new Error("That request has already been decided"), { statusCode: 409 });
  }
  const code = params.patch.code?.trim().toUpperCase();
  if (code && !CODE_RE.test(code)) {
    throw Object.assign(new Error("Code must be 2 to 8 letters or digits"), { statusCode: 400 });
  }
  return prisma.onboardingRequest.update({
    where: { id: params.id },
    data: {
      ...params.patch,
      ...(code !== undefined ? { code: code || null } : {}),
    },
  });
}

/**
 * Approve a lead and create the account it describes.
 *
 * The status claim and the account creation share one transaction, so a
 * duplicate press cannot produce two merchants with the same name, and a
 * failure to create (a code clash, most often) leaves the lead exactly where
 * it was rather than APPROVED with nothing behind it.
 */
export async function approveOnboardingRequest(params: {
  tenantId: string;
  id: string;
  reviewerId: string;
  note?: string | null;
  /** Reviewer's final say on the merchant code, overriding what sales typed. */
  code?: string | null;
}) {
  const { tenantId, id, reviewerId } = params;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.onboardingRequest.updateMany({
      where: { id, tenantId, status: { in: ["NEW", "IN_REVIEW"] } },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.note ?? null,
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("That request has already been decided"), { statusCode: 409 });
    }
    const request = await tx.onboardingRequest.findFirstOrThrow({ where: { id, tenantId } });

    if (request.type === "VENDOR") {
      const code = (params.code ?? request.code ?? suggestVendorCode(request.companyName))
        .trim()
        .toUpperCase();
      if (!CODE_RE.test(code)) {
        throw Object.assign(new Error("Code must be 2 to 8 letters or digits"), { statusCode: 400 });
      }
      const clash = await tx.vendor.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (clash) {
        // Thrown inside the transaction, so the APPROVED stamp above rolls
        // back with it and the reviewer is asked for a different code.
        throw Object.assign(new Error(`Code ${code} is already in use`), { statusCode: 409 });
      }
      const vendor = await tx.vendor.create({
        data: {
          tenantId,
          name: request.companyName,
          nameAr: request.companyNameAr,
          code,
          phone: request.contactPhone,
        },
      });
      await tx.onboardingRequest.update({
        where: { id: request.id },
        data: { vendorId: vendor.id, code },
      });
      return { request: { ...request, vendorId: vendor.id, code }, vendorId: vendor.id, fleetPartnerId: null };
    }

    const fleet = await tx.fleetPartner.create({
      data: {
        tenantId,
        name: request.companyName,
        contactName: request.contactName,
        contactPhone: request.contactPhone,
        contactEmail: request.contactEmail,
      },
    });
    await tx.onboardingRequest.update({
      where: { id: request.id },
      data: { fleetPartnerId: fleet.id },
    });
    return { request: { ...request, fleetPartnerId: fleet.id }, vendorId: null, fleetPartnerId: fleet.id };
  });
}

/** Reject a lead. The reason is required and the rep sees it verbatim. */
export async function rejectOnboardingRequest(params: {
  tenantId: string;
  id: string;
  reviewerId: string;
  reason: string;
}) {
  if (!params.reason?.trim()) {
    throw Object.assign(new Error("A reason is required"), { statusCode: 400 });
  }
  const claimed = await prisma.onboardingRequest.updateMany({
    where: { id: params.id, tenantId: params.tenantId, status: { in: ["NEW", "IN_REVIEW"] } },
    data: {
      status: "REJECTED",
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
      reviewNote: params.reason.trim(),
    },
  });
  if (claimed.count === 0) {
    throw Object.assign(new Error("That request has already been decided"), { statusCode: 409 });
  }
  return prisma.onboardingRequest.findFirst({
    where: { id: params.id, tenantId: params.tenantId },
  });
}

/** Counts for the Ops tab strip and the rail badge. */
export async function onboardingCounts(tenantId: string) {
  const [newCount, inReview] = await Promise.all([
    prisma.onboardingRequest.count({ where: { tenantId, status: "NEW" } }),
    prisma.onboardingRequest.count({ where: { tenantId, status: "IN_REVIEW" } }),
  ]);
  return { new: newCount, inReview, waiting: newCount + inReview };
}
