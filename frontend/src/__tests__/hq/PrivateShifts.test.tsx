// Revision 24 (#8 to #10) — private shifts on screen.
//
// Each side sees its own money: the shop what it is charged, the delivery
// company what it is paid, Darb both. And a per-vehicle rate proposal reads on
// the approval desk as the numbers it moves, not as a base price of nothing.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PrivateShiftDetail } from "@/types/privateShifts";

vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));

import PrivateShiftDetailBody from "@/components/privateShifts/PrivateShiftDetailBody";
import { vehicleRatesSummary } from "@/lib/vehicleRatesSummary";

const SHIFT: PrivateShiftDetail = {
  id: "ps-1",
  planId: null,
  vendorId: "v-1",
  branchId: "br-1",
  vehicleType: "MOTORCYCLE",
  date: "2026-10-14",
  startAt: "2026-10-14T09:00:00.000Z",
  endAt: "2026-10-14T13:00:00.000Z",
  status: "COMPLETED",
  source: "VENDOR",
  driverId: "d-1",
  fleetPartnerId: "f-1",
  bookedAt: null,
  startedAt: "2026-10-14T09:00:00.000Z",
  endedAt: null,
  cancelledAt: null,
  cancelReason: null,
  scheduledMinutes: 240,
  lateDeductionMinutes: 30,
  awayDeductionMinutes: 0,
  billableMinutes: 210,
  vendorHourlyKwd: "3.000",
  fleetHourlyKwd: "2.000",
  vendorChargeKwd: "10.500",
  fleetPayKwd: "7.000",
  settledAt: "2026-10-14T13:00:00.000Z",
  vendor: { id: "v-1", name: "Burger Boulevard" },
  branch: { id: "br-1", name: "Salmiya" },
  driver: { id: "d-1", name: "Adil", driverCode: "DRB-0001", phone: null },
  fleetPartner: { id: "f-1", name: "Marina" },
  deductions: [{ id: "x", kind: "LATE_ORDER", minutes: 30, orderId: "o-1", fromAt: null, toAt: null }],
  preview: null,
  orders: [{ id: "o-1", orderNumber: "DRB-BRGB-0001", status: "DELIVERED", assignedAt: null, deliveredAt: "2026-10-14T10:15:00.000Z", slaDeadline: null }],
  kpis: { delivered: 1, onTime: 0, onTimeRate: 0 },
};

describe("private shift detail", () => {
  it("the shop sees its charge and not the company's pay", () => {
    render(<PrivateShiftDetailBody shift={SHIFT} showVendorCharge showFleetPay={false} />);
    expect(screen.getByText("privateShifts.vendorCharge")).toBeInTheDocument();
    expect(screen.queryByText("privateShifts.fleetPay")).toBeNull();
    expect(screen.getByTestId("private-shift-detail").textContent).toMatch(/10\.500/);
    expect(screen.getByTestId("private-shift-detail").textContent).not.toMatch(/7\.000/);
    expect(screen.getByText(/privateShifts.kind_LATE_ORDER/)).toHaveTextContent("DRB-BRGB-0001");
  });

  it("the company sees its pay and not the shop's charge", () => {
    render(<PrivateShiftDetailBody shift={SHIFT} showVendorCharge={false} showFleetPay />);
    expect(screen.queryByText("privateShifts.vendorCharge")).toBeNull();
    expect(screen.getByTestId("private-shift-detail").textContent).toMatch(/7\.000/);
  });
});

describe("vehicle rate proposal on the approval desk", () => {
  it("names each vehicle with what it moves from and to", () => {
    const line = vehicleRatesSummary(
      {
        vehicleRates: [{ vehicleType: "CAR", perOrderKwd: "1.500", perHourKwd: "2.500" }],
        currentVehicleRates: [{ vehicleType: "CAR", perOrderKwd: null, perHourKwd: "2.000" }],
        reason: "fuel",
      },
      (k) => k,
      "en",
    );
    expect(line).toMatch(/privateShifts\.vehicle_CAR/);
    expect(line).toMatch(/2\.000.*→.*2\.500/);
    expect(line).toMatch(/fuel$/);
  });

  it("leaves an ordinary base-price proposal to the existing line", () => {
    expect(vehicleRatesSummary({ flatFeePerOrderKwd: "1.200" }, (k) => k, "en")).toBeNull();
  });
});
