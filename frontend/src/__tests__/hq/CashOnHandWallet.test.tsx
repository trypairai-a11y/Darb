// Client note of 2026-10-04, "add one more column, the wallet for each delivery
// company", answered "Not done" on 2026-10-05. A company with nobody on its
// roster now comes back from the server with its wallet, and the tab must
// draw that row and the wallet total, not only companies carrying cash.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/darbApi", () => ({
  financeDeskApi: {
    cashOnHand: async () => ({
      totalKwd: "7.250",
      walletTotalKwd: "52.500",
      asOf: "2026-10-05T10:00:00Z",
      companies: [
        { fleetPartnerId: "f-1", name: "Marina", driverCount: 1, driversCarrying: 1, cashOnHandKwd: "7.250", walletKwd: "40.000", drivers: [] },
        { fleetPartnerId: "f-2", name: "Sidra", driverCount: 0, driversCarrying: 0, cashOnHandKwd: "0.000", walletKwd: "12.500", drivers: [] },
        { fleetPartnerId: null, name: "Darb", driverCount: 2, driversCarrying: 0, cashOnHandKwd: "0.000", walletKwd: null, drivers: [] },
      ],
    }),
    cashOnHandXlsxUrl: "/x.xlsx",
  },
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import CashOnHandTab from "@/components/hq/CashOnHandTab";

describe("Cash with companies, wallet column", () => {
  it("shows each company's own wallet, including a company with no drivers", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CashOnHandTab />
      </QueryClientProvider>,
    );
    const rows = await screen.findAllByTestId("cash-company-row");
    expect(rows).toHaveLength(3);
    const sidra = rows.find((r) => r.textContent?.includes("Sidra"))!;
    expect(within(sidra).getByTestId("cash-company-wallet").textContent).toMatch(/12\.500/);
    const darb = rows.find((r) => r.textContent?.includes("Darb"))!;
    expect(within(darb).getByTestId("cash-company-wallet")).toHaveTextContent("n/a");
    expect(screen.getByTestId("cash-wallet-total").textContent).toMatch(/52\.500/);
  });
});
