/**
 * Revision 12 — the document catalogue behind the fleet portal's Documents tab
 * and driver onboarding.
 *
 * `FleetDocument` is the file plus the audit trail of what a delivery company
 * showed Darb and when. It is NOT the read model. Approving a driver document
 * also writes the matching `Driver.<doc>Expiry` / `<doc>Status` pair, so every
 * surface that already reads those columns (the roster's "3/4" summary, the
 * staff driver profile, the expiry alerts) keeps working untouched. Getting
 * this backwards would have meant rewriting four screens to ship one tab.
 */
import { prisma } from "../../config";

/** Documents that belong to the delivery company itself. */
export const COMPANY_DOC_TYPES = [
  "TRADE_LICENSE",
  "COMMERCIAL_REG",
  "CIVIL_INSURANCE",
  "VAT_CERT",
] as const;

/**
 * Documents that belong to a driver, each paired with the `Driver` columns an
 * approval writes through to. A type with no pair here would be storable but
 * invisible to every existing surface, which is the bug this map prevents.
 */
export const DRIVER_DOC_COLUMNS = {
  CIVIL_ID: { expiry: "civilIdExpiry", status: "civilIdStatus" },
  DRIVING_LICENSE: { expiry: "drivingLicenseExpiry", status: "drivingLicenseStatus" },
  VEHICLE_REG: { expiry: "vehicleRegExpiry", status: "vehicleRegStatus" },
  VEHICLE_INSURANCE: { expiry: "vehicleInsuranceExpiry", status: "vehicleInsuranceStatus" },
  HEALTH_CERT: { expiry: "healthCertExpiry", status: "healthCertStatus" },
  WORK_PERMIT: { expiry: "workPermitExpiry", status: "workPermitStatus" },
  FOOD_HANDLING: { expiry: "foodHandlingCertExpiry", status: "foodHandlingCertStatus" },
  // Client request, revision 16 (#3). The selfie has no expiry of its own; it
  // keeps a column pair anyway so it is counted and shown beside the rest
  // rather than being storable and invisible, which is what this map exists to
  // prevent.
  POLICE_CLEARANCE: { expiry: "policeClearanceExpiry", status: "policeClearanceStatus" },
  PASSPORT: { expiry: "passportExpiry", status: "passportStatus" },
  DRIVER_SELFIE: { expiry: "driverSelfieExpiry", status: "driverSelfieStatus" },
} as const;

export type DriverDocType = keyof typeof DRIVER_DOC_COLUMNS;
export type CompanyDocType = (typeof COMPANY_DOC_TYPES)[number];

/**
 * The driver documents Darb requires before a driver may be activated.
 *
 * Client request, revision 16 (#3): the eight the client named, up from three.
 * Vehicle insurance and food handling stay storable but optional because they
 * were not on that list. Safe to widen because the approve button WARNS on a
 * gap rather than blocking it, so an existing driver missing a passport scan
 * shows as incomplete instead of being deactivated overnight.
 */
export const REQUIRED_DRIVER_DOCS: DriverDocType[] = [
  "CIVIL_ID",
  "DRIVING_LICENSE",
  "WORK_PERMIT",
  "HEALTH_CERT",
  "VEHICLE_REG",
  "POLICE_CLEARANCE",
  "PASSPORT",
  "DRIVER_SELFIE",
];

export function isDriverDocType(t: string): t is DriverDocType {
  return Object.prototype.hasOwnProperty.call(DRIVER_DOC_COLUMNS, t);
}

export function isCompanyDocType(t: string): t is CompanyDocType {
  return (COMPANY_DOC_TYPES as readonly string[]).includes(t);
}

/** Days before expiry at which a document starts reading EXPIRING. */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * The word the rest of the platform uses for a document's health, derived from
 * its expiry date alone. Matches the vocabulary already in `Driver.*Status`
 * (VALID | EXPIRING | EXPIRED | MISSING) rather than inventing a second one.
 */
export function deriveDocHealth(expiry: Date | null | undefined, now = new Date()): string {
  if (!expiry) return "MISSING";
  const ms = expiry.getTime() - now.getTime();
  if (ms < 0) return "EXPIRED";
  if (ms < EXPIRY_WARNING_DAYS * 86_400_000) return "EXPIRING";
  return "VALID";
}

/**
 * Write an approved driver document through to the `Driver` columns every
 * existing surface reads. Runs inside the approval transaction, so a document
 * can never read VALID while the driver row still says MISSING.
 */
export async function applyDriverDocToDriver(
  tx: {
    driver: { update: (args: any) => Promise<unknown> };
  },
  driverId: string,
  type: string,
  expiry: Date | null,
): Promise<void> {
  if (!isDriverDocType(type)) return;
  const cols = DRIVER_DOC_COLUMNS[type];
  await tx.driver.update({
    where: { id: driverId },
    data: {
      [cols.expiry]: expiry,
      [cols.status]: deriveDocHealth(expiry),
    },
  });
}

/**
 * True when the driver holds a currently valid document of every required
 * type. Darb's approve button checks this and warns rather than blocks: an ops
 * user who can see the scans is a better judge than a date column, and a hard
 * block would just push the onboarding back to WhatsApp.
 */
export async function missingRequiredDocs(
  tenantId: string,
  documentIds: string[],
): Promise<DriverDocType[]> {
  if (documentIds.length === 0) return [...REQUIRED_DRIVER_DOCS];
  const docs = await prisma.fleetDocument.findMany({
    where: { tenantId, id: { in: documentIds } },
    select: { type: true, expiryDate: true },
  });
  const held = new Set(
    docs
      .filter((d) => deriveDocHealth(d.expiryDate) !== "EXPIRED")
      .map((d) => d.type),
  );
  return REQUIRED_DRIVER_DOCS.filter((t) => !held.has(t));
}

/**
 * Client note (2026-08-31): "still I can't see the documents". Root cause —
 * with R2 unconfigured (production today) the portal could only submit a
 * document's metadata, so there was never a file to view. Documents now take
 * the same inline-bytes fallback the payout invoice uses, and these helpers
 * are the seam: list queries select everything EXCEPT the bytea column, and
 * responses carry `hasFile` so the UI knows a chip is openable.
 */
export const FLEET_DOC_LIST_SELECT = {
  id: true,
  tenantId: true,
  fleetPartnerId: true,
  driverId: true,
  type: true,
  fileKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  expiryDate: true,
  status: true,
  rejectionReason: true,
  uploadedById: true,
  reviewedById: true,
  reviewedAt: true,
  supersededById: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Strip the bytes (a freshly created row still carries them) and answer
 * whether a file exists at all. On select-queried rows fileData is absent, so
 * sizeBytes stands in: it is only ever written alongside an actual file —
 * expiry-date-only submissions leave it null.
 */
export function toDocDto<T extends { fileKey: string | null; sizeBytes: number | null }>(
  doc: T,
): Omit<T, "fileData"> & { hasFile: boolean } {
  const { fileData, ...rest } = doc as T & { fileData?: Uint8Array | null };
  return {
    ...rest,
    hasFile: doc.fileKey != null || fileData != null || doc.sizeBytes != null,
  };
}

/** Is Cloudflare R2 wired up on this host? */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}
