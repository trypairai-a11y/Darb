// Revision 24 (#17): "for the cash on hand of the drivers, we should be able to
// press on the driver and see the actual ledger of each transaction, visible
// for the admin and the delivery company portal."
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const driverCashLedger = vi.fn(async () => ({
  driver: { id: "d-1", name: "Ali", driverCode: "DRB-1", phone: null, fleetPartnerId: "f-1", fleetPartnerName: "Marina" },
  balanceKwd: "7.250",
  data: [
    { id: "e-2", createdAt: "2026-10-12T10:00:00Z", type: "REMITTANCE", direction: "OUT", amountKwd: "5.000",
      runningBalanceKwd: "7.250", orderId: null, orderNumber: null, remittanceId: "r-1", remittanceMethod: "CASH",
      settledByCompany: false, memo: null },
    { id: "e-1", createdAt: "2026-10-11T10:00:00Z", type: "COD_SETTLEMENT", direction: "IN", amountKwd: "12.250",
      runningBalanceKwd: "12.250", orderId: "o-1", orderNumber: "DRB-RP-0042", remittanceId: null, remittanceMethod: null,
      settledByCompany: false, memo: null },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
}));

vi.mock("@/lib/darbApi", () => ({
  financeDeskApi: {
    cashOnHand: async () => ({
      totalKwd: "7.250",
      walletTotalKwd: "0.000",
      asOf: "2026-10-12T10:00:00Z",
      companies: [
        {
          fleetPartnerId: "f-1", name: "Marina", driverCount: 1, driversCarrying: 1, cashOnHandKwd: "7.250", walletKwd: "0.000",
          drivers: [{ driverId: "d-1", name: "Ali", driverCode: "DRB-1", phone: null, status: "ACTIVE", cashOnHandKwd: "7.250" }],
        },
      ],
    }),
    cashOnHandXlsxUrl: "/x.xlsx",
    driverCashLedger: (...args: unknown[]) => (driverCashLedger as any)(...args),
  },
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import CashOnHandTab from "@/components/hq/CashOnHandTab";

describe("Cash with companies, a driver's ledger", () => {
  it("pressing a driver opens every posting behind their cash on hand", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CashOnHandTab />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("cash-company-row"));
    fireEvent.click(screen.getByTestId("cash-driver-row"));
    const panel = await screen.findByTestId("driver-cash-ledger");
    expect(driverCashLedger).toHaveBeenCalledWith("d-1", { page: 1, limit: 50 });
    const rows = await within(panel).findAllByTestId("driver-cash-ledger-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("cashLedger.typeREMITTANCE");
    expect(rows[1]).toHaveTextContent("DRB-RP-0042");
    expect(rows[1]).toHaveTextContent("cashLedger.typeCOD_SETTLEMENT");
    expect(within(panel).getByTestId("driver-cash-ledger-balance").textContent).toMatch(/7\.250/);
    // Everything is on one page, so there is nothing more to load.
    expect(within(panel).queryByTestId("driver-cash-ledger-more")).toBeNull();
  });
});
