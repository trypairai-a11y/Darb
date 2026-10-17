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

// Revision 24b — the charge reaches the shop's wallet, and the detail says so.
describe("charged private shift", () => {
  it("reads Charged, with the day the wallet was charged, on the shop's side", () => {
    render(
      <PrivateShiftDetailBody
        shift={{ ...SHIFT, charged: true, chargedAt: "2026-10-14T13:01:00.000Z" }}
        showVendorCharge
        showFleetPay={false}
      />,
    );
    expect(screen.getByTestId("private-shift-charged")).toHaveTextContent("privateShifts.charged");
    expect(screen.getByText("privateShifts.chargedNote")).toBeInTheDocument();
  });

  it("a settled shift that was not charged keeps the Settled label", () => {
    render(<PrivateShiftDetailBody shift={{ ...SHIFT, charged: false }} showVendorCharge showFleetPay={false} />);
    expect(screen.queryByTestId("private-shift-charged")).toBeNull();
    expect(screen.getByText("privateShifts.settled")).toBeInTheDocument();
  });

  it("the company is told it is paid on its monthly statement", () => {
    render(<PrivateShiftDetailBody shift={SHIFT} showVendorCharge={false} showFleetPay />);
    expect(screen.getByText("privateShifts.onFleetStatement")).toBeInTheDocument();
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

  it("carries the per km rate when the proposal has it (2026-10-15)", () => {
    const line = vehicleRatesSummary(
      {
        vehicleRates: [{ vehicleType: "MOTORCYCLE", perOrderKwd: "0.800", perKmKwd: "0.100", perHourKwd: null }],
        currentVehicleRates: [{ vehicleType: "MOTORCYCLE", perOrderKwd: "1.100", perKmKwd: null, perHourKwd: null }],
      },
      (k) => k,
      "en",
    );
    expect(line).toMatch(/privateShifts\.baseFee .*1\.100.*→.*0\.800/);
    expect(line).toMatch(/privateShifts\.perKmRate n\/a → .*0\.100/);
  });

  it("an older proposal without per km does not claim a per km change", () => {
    const line = vehicleRatesSummary(
      { vehicleRates: [{ vehicleType: "CAR", perOrderKwd: "1.500", perHourKwd: null }] },
      (k) => k,
      "en",
    );
    expect(line).not.toMatch(/perKmRate/);
  });

  it("leaves an ordinary base-price proposal to the existing line", () => {
    expect(vehicleRatesSummary({ flatFeePerOrderKwd: "1.200" }, (k) => k, "en")).toBeNull();
  });
});
