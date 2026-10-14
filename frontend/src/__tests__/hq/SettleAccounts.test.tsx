// Revision 24 (#7): "one more tab for settling accounts with the vendors and
// delivery companies. So if the amount is transferred, the action we will take
// is pressing either Settled or Partially settled."
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const recordSettlement = vi.fn();

vi.mock("@/lib/darbApi", () => ({
  financeDeskApi: {
    settlements: async () => ({
      totals: { owedByDarbKwd: "160.000", owedToDarbKwd: "25.500", open: 2, partial: 1 },
      data: [
        {
          partyType: "VENDOR", partyId: "v-1", partyName: "Royal Pharmacy", statementId: "vs-1",
          periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z",
          flow: "DARB_PAYS", amountDueKwd: "100.000", settledKwd: "40.000", remainingKwd: "60.000",
          state: "PARTIALLY_SETTLED", statementStatus: "FINAL", paidOutsideSettlement: false,
          canSettle: true, blockedReason: null, lastTransferAt: "2026-10-02T00:00:00.000Z",
          transfers: [
            { id: "as-1", amountKwd: "40.000", remainingKwd: "60.000", status: "PARTIALLY_SETTLED",
              transferredAt: "2026-10-02T00:00:00.000Z", reference: "TRX-77", note: null, payoutTxId: null,
              createdById: "u-1", createdByName: "Huda", createdAt: "2026-10-02T00:00:00.000Z" },
          ],
        },
        {
          partyType: "FLEET", partyId: "f-1", partyName: "Marina Logistics", statementId: "fs-1",
          periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z",
          flow: "DARB_PAYS", amountDueKwd: "100.000", settledKwd: "0.000", remainingKwd: "100.000",
          state: "OPEN", statementStatus: "FINAL", paidOutsideSettlement: false,
          canSettle: false, blockedReason: "NOT_CONFIRMED", lastTransferAt: null, transfers: [],
        },
      ],
    }),
    recordSettlement: (...args: unknown[]) => recordSettlement(...args),
  },
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ isRole: () => true, hasRole: () => true }) }));

import SettleAccountsTab from "@/components/hq/SettleAccountsTab";

function renderTab() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettleAccountsTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recordSettlement.mockReset();
  recordSettlement.mockResolvedValue({ id: "as-2", status: "PARTIALLY_SETTLED", amountKwd: "10.000", remainingKwd: "50.000", payoutTxId: null });
});

describe("Finance › Settle accounts", () => {
  it("lists each account with what is due, transferred and still open", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    expect(rows).toHaveLength(2);
    const royal = rows.find((r) => r.textContent?.includes("Royal Pharmacy"))!;
    expect(within(royal).getByTestId("settle-remaining").textContent).toMatch(/60\.000/);
    expect(within(royal).getByTestId("settle-state")).toHaveTextContent("settleAccounts.statePARTIALLY_SETTLED");
    expect(screen.getByTestId("settle-owed-by-darb").textContent).toMatch(/160\.000/);
  });

  it("offers no buttons on a delivery company month the company has not confirmed", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    const marina = rows.find((r) => r.textContent?.includes("Marina"))!;
    expect(within(marina).queryByTestId("settle-mark-settled")).toBeNull();
    expect(marina).toHaveTextContent("settleAccounts.blockedNOT_CONFIRMED");
  });

  it("records a partial settlement with amount, date and reference", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    const royal = rows.find((r) => r.textContent?.includes("Royal Pharmacy"))!;
    fireEvent.click(within(royal).getByTestId("settle-mark-partial"));
    const form = screen.getByTestId("settle-form");
    fireEvent.change(within(form).getByTestId("settle-amount"), { target: { value: "10" } });
    fireEvent.change(within(form).getByLabelText("settleAccounts.reference"), { target: { value: "TRX-88" } });
    fireEvent.click(within(form).getByTestId("settle-submit"));
    await waitFor(() => expect(recordSettlement).toHaveBeenCalledTimes(1));
    expect(recordSettlement.mock.calls[0][0]).toMatchObject({
      partyType: "VENDOR", statementId: "vs-1", action: "PARTIALLY_SETTLED", amountKwd: "10", reference: "TRX-88",
    });
    expect(recordSettlement.mock.calls[0][0].transferredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("will not submit more than the remaining balance", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    const royal = rows.find((r) => r.textContent?.includes("Royal Pharmacy"))!;
    fireEvent.click(within(royal).getByTestId("settle-mark-partial"));
    fireEvent.change(screen.getByTestId("settle-amount"), { target: { value: "75" } });
    expect(screen.getByTestId("settle-submit")).toBeDisabled();
    expect(screen.getByText("settleAccounts.amountTooHigh")).toBeInTheDocument();
  });

  it("Settled sends the whole remaining balance, with no amount to type", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    const royal = rows.find((r) => r.textContent?.includes("Royal Pharmacy"))!;
    fireEvent.click(within(royal).getByTestId("settle-mark-settled"));
    expect(screen.queryByTestId("settle-amount")).toBeNull();
    fireEvent.click(screen.getByTestId("settle-submit"));
    await waitFor(() => expect(recordSettlement).toHaveBeenCalledTimes(1));
    expect(recordSettlement.mock.calls[0][0]).toMatchObject({ action: "SETTLED", amountKwd: undefined });
  });

  it("opens the transfer history with who recorded it", async () => {
    renderTab();
    const rows = await screen.findAllByTestId("settle-row");
    fireEvent.click(rows.find((r) => r.textContent?.includes("Royal Pharmacy"))!);
    const history = screen.getByTestId("settle-history");
    expect(history).toHaveTextContent("TRX-77");
    expect(history).toHaveTextContent("settleAccounts.by");
  });
});
