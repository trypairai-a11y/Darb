// Revision 24 (#2): "it is showing the Admin portal users. This column should
// be unique according to the portal." A shop login is offered the shop's
// roles, a delivery company login the company's, and only an HQ login the HQ
// staff roles.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const user = (over: Record<string, unknown>) => ({
  name: "x", email: "x@x.kw", isActive: true, lastLoginAt: null, vendorId: null, fleetPartnerId: null,
  portal: null, portalRole: null, ...over,
});

const responses: Record<string, { data: unknown }> = {
  "/api/users?limit=100": {
    data: {
      data: [
        user({ id: "u-hq", name: "Huda", role: "ACCOUNTANT" }),
        user({ id: "u-shop", name: "aa", role: "VENDOR", vendorId: "v-1", portal: "VENDOR", portalRole: "ACCOUNTANT" }),
        user({ id: "u-fleet", name: "omar", role: "FLEET", fleetPartnerId: "f-1", portal: "FLEET", portalRole: "ADMIN" }),
        user({ id: "u-old", name: "test", role: "VENDOR", vendorId: "v-1", portal: "VENDOR", portalRole: "VIEWER" }),
      ],
    },
  },
};

vi.mock("@/hooks/useApi", () => ({
  useApiGet: (url: string | null) => ({ data: url ? responses[url]?.data ?? null : null, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { name: "Admin", email: "a@darb.kw" } }) }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/hq/HqTabs", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));

import SettingsPage from "@/app/(dashboard)/settings/page";

function optionsOf(row: HTMLElement): string[] {
  const select = row.querySelector("select")!;
  return Array.from(select.querySelectorAll("option")).map((o) => o.textContent ?? "");
}

describe("Accounts and access, Role column per portal", () => {
  it("offers each portal its own roles", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText("settingsPage.tabUsers"));
    const cells = screen.getAllByTestId("user-role-cell");

    expect(optionsOf(cells[0])).toContain("ADMIN");
    expect(optionsOf(cells[0])).toContain("ACCOUNT MANAGER");

    expect(optionsOf(cells[1])).toEqual([
      "portalRoleNames.vendorADMIN",
      "portalRoleNames.vendorACCOUNTANT",
      "portalRoleNames.vendorSUPERVISOR",
    ]);
    expect(optionsOf(cells[2])).toEqual([
      "portalRoleNames.fleetADMIN",
      "portalRoleNames.fleetOPS_MANAGER",
      "portalRoleNames.fleetACCOUNTANT",
    ]);
    // An older role a login still holds stays visible rather than misread.
    expect(optionsOf(cells[3])).toEqual([
      "portalRoleNames.vendorADMIN",
      "portalRoleNames.vendorACCOUNTANT",
      "portalRoleNames.vendorSUPERVISOR",
      "portalRoles.VIEWER",
    ]);
  });
});
