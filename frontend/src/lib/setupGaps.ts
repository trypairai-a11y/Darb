// Revision 21c — the words for each empty "cell" on an approved account.
// Codes come from the server (services/onboarding/setupCompleteness.ts); the
// sentence is built here so the list badge, the detail checklist and the
// Admin card say the same thing.
import type { FleetSetupGap, VendorSetupGap } from "@/types/darb";

const VENDOR_GAP_I18N: Record<VendorSetupGap, string> = {
  PHONE: "vendorsPage.setupMissingPhone",
  BRANCH: "vendorsPage.setupMissingBranch",
  LOGIN: "vendorsPage.setupMissingLogin",
};

const FLEET_GAP_I18N: Record<FleetSetupGap, string> = {
  CONTACT_PHONE: "adminHub.setupMissingContactPhone",
  LOGIN: "vendorsPage.setupMissingLogin",
};

export function vendorGapKeys(missing: VendorSetupGap[] | undefined): string[] {
  return (missing ?? []).map((g) => VENDOR_GAP_I18N[g]).filter(Boolean);
}

export function fleetGapKeys(missing: FleetSetupGap[] | undefined): string[] {
  return (missing ?? []).map((g) => FLEET_GAP_I18N[g]).filter(Boolean);
}

/** True when the account is switched off AND something is still empty: the onboarding case. */
export function setupIncomplete(row: { isActive?: boolean; setupMissing?: string[] }): boolean {
  return row.isActive === false && (row.setupMissing?.length ?? 0) > 0;
}
