/**
 * Revision 21c (client note, 2026-09-21): "I have approved a new shop, must
 * fill all the cells to be active, and must show in the admin dashboard that
 * a vendor/delivery company onboarding is still incomplete".
 *
 * Approval used to create a Vendor with the default `isActive: true`, so a
 * shop with no phone, no branch and no login sat in the list marked Active
 * and intake would have accepted its orders. What "the cells" are is written
 * down here, once, so the list badge, the detail checklist, the activation
 * guard and the Admin card cannot disagree about what complete means.
 *
 * A gap is a CODE, not a sentence, because the screen that shows it is in
 * two languages and the server is in neither.
 */
import { prisma } from "../../config";

export type VendorSetupGap = "PHONE" | "BRANCH" | "LOGIN";
export type FleetSetupGap = "CONTACT_PHONE" | "LOGIN";

/** A shop needs a number to call, somewhere to collect from, and somebody who can log in. */
export function vendorSetupMissing(v: {
  phone: string | null;
  branchCount: number;
  userCount: number;
}): VendorSetupGap[] {
  const missing: VendorSetupGap[] = [];
  if (!v.phone?.trim()) missing.push("PHONE");
  if (v.branchCount < 1) missing.push("BRANCH");
  if (v.userCount < 1) missing.push("LOGIN");
  return missing;
}

/**
 * A delivery company needs a contact number and a portal login. Drivers are
 * deliberately NOT required: the roster arrives through the fleet portal's
 * own request desk, which needs the login first.
 */
export function fleetSetupMissing(f: {
  contactPhone: string | null;
  userCount: number;
}): FleetSetupGap[] {
  const missing: FleetSetupGap[] = [];
  if (!f.contactPhone?.trim()) missing.push("CONTACT_PHONE");
  if (f.userCount < 1) missing.push("LOGIN");
  return missing;
}

function incomplete(missing: string[]) {
  return Object.assign(new Error("Fill in the missing details before activating this account"), {
    statusCode: 409,
    code: "SETUP_INCOMPLETE",
    missing,
  });
}

/** Throws 409 SETUP_INCOMPLETE (with the gaps) when the shop cannot be activated yet. */
export async function assertVendorSetupComplete(tenantId: string, vendorId: string) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { phone: true, _count: { select: { branches: true, users: true } } },
  });
  if (!v) return;
  const missing = vendorSetupMissing({
    phone: v.phone,
    branchCount: v._count.branches,
    userCount: v._count.users,
  });
  if (missing.length) throw incomplete(missing);
}

/** The delivery-company twin of the above. */
export async function assertFleetSetupComplete(tenantId: string, fleetId: string) {
  const f = await prisma.fleetPartner.findFirst({
    where: { id: fleetId, tenantId },
    select: { contactPhone: true, _count: { select: { users: true } } },
  });
  if (!f) return;
  const missing = fleetSetupMissing({ contactPhone: f.contactPhone, userCount: f._count.users });
  if (missing.length) throw incomplete(missing);
}
