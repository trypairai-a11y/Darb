// Client notes of 2026-09-23 ("when I try to adjust the permission for the
// delivery company user it shows me the HQ tabs") and 2026-10-05 ("This edit
// is not done"). The Permissions dialog reads the server's `portal` answer;
// the list's Portal column read only the company link, so a delivery company
// login without one (an owner-group login) was labelled HQ in the list. The
// dialog also titled every portal login by its staff role (FLEET), and spun
// forever when the load was refused.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const responses: Record<string, { data: unknown; error?: string | null }> = {
  "/api/users?limit=100": {
    data: {
      data: [
        {
          id: "u-fleet",
          name: "Group Owner",
          email: "owner@fleet.kw",
          role: "FLEET",
          isActive: true,
          lastLoginAt: null,
          vendorId: null,
          fleetPartnerId: null,
          portal: "FLEET",
          portalRole: "SUPERVISOR",
        },
      ],
    },
  },
  "/api/users/u-fleet/permissions": {
    data: { portal: "FLEET", portalRole: "SUPERVISOR", portalTabs: null, effectiveTabs: ["ROSTER", "ISSUES", "SUPPORT"] },
  },
};

vi.mock("@/hooks/useApi", () => ({
  useApiGet: (url: string | null) => {
    const hit = url ? responses[url] : undefined;
    return { data: hit?.data ?? null, loading: false, error: hit?.error ?? null, refetch: vi.fn() };
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { name: "Admin", email: "a@darb.kw" } }) }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/hq/HqTabs", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));

import SettingsPage from "@/app/(dashboard)/settings/page";

function openUsers() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByText("settingsPage.tabUsers"));
}

describe("Accounts access, delivery company logins", () => {
  it("labels a delivery company login by the server's answer, even with no company link", () => {
    openUsers();
    expect(screen.getByTestId("user-portal-cell")).toHaveTextContent("Delivery company");
  });

  it("opens the portal's own tabs, titled by the portal role, never the four HQ tabs", () => {
    openUsers();
    fireEvent.click(screen.getByTitle("Permissions"));
    expect(screen.getByTestId("permission-portal-tabs")).toBeInTheDocument();
    expect(screen.queryByTestId("permission-tabs")).toBeNull();
    expect(screen.getByText(/Delivery company · portalRoles\.SUPERVISOR/)).toBeInTheDocument();
  });

  it("shows the error instead of spinning when the dialog cannot load", () => {
    responses["/api/users/u-fleet/permissions"] = { data: null, error: "You don't have permission to view this data." };
    openUsers();
    fireEvent.click(screen.getByTitle("Permissions"));
    expect(screen.getByText("You don't have permission to view this data.")).toBeInTheDocument();
  });
});
