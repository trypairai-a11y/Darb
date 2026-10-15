// Revision 24 (#3): billing's "active courier" is four hours worked on one
// day of the month, summed over that day's slots. A driver on 3+3+2+4 never
// has a single slot past 240 minutes and used to never count as active.

import { computeMonthlyBill, isCourierActiveThisMonth } from "../../services/billing/billingService";
import { prisma } from "../mocks/config";

const TENANT = "t-bill-day";
// Kuwait midnight on 15 and 16 October, as booking stores Shift.date.
const D15 = new Date("2026-10-14T21:00:00.000Z");
const D16 = new Date("2026-10-15T21:00:00.000Z");

function row(driverId: string, date: Date, minutes: number) {
  return { driverId, tenantId: TENANT, date, actualHoursMinutes: minutes };
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma as any).tenant = {
    findFirst: jest.fn().mockResolvedValue({ id: TENANT, designPartner: false, monthlyOverrideKd: null }),
  };
});

describe("computeMonthlyBill: the 4-hour test is per driver per day", () => {
  test("slots of one day add up; short days on separate dates do not", async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      // 3 + 3 + 2 + 4 hours on one day: active, though no slot reaches 4h.
      row("drv-stack", D15, 180),
      row("drv-stack", D15, 180),
      row("drv-stack", D15, 120),
      row("drv-stack", D15, 240),
      // 2h + 1h50 on one day: 230 minutes, not active.
      row("drv-short", D15, 120),
      row("drv-short", D15, 110),
      // 3h20 on two different days: never 4h on a day, not active.
      row("drv-split", D15, 200),
      row("drv-split", D16, 200),
      // Exactly 4h from two 2h slots.
      row("drv-edge", D16, 120),
      row("drv-edge", D16, 120),
      // Another tenant's rows never count.
      { driverId: "drv-other", tenantId: "t-other", date: D15, actualHoursMinutes: 720 },
    ]);

    const bill = await computeMonthlyBill({ tenantId: TENANT, yearMonth: "2026-10" });

    expect(bill.activeCouriers).toBe(2);
    const where = (prisma.shift.findMany as jest.Mock).mock.calls[0][0].where;
    // Every worked slot is read; the threshold is applied after the sum.
    expect(where.actualHoursMinutes).toEqual({ gt: 0 });
  });

  test("a driver active on two days is still one courier", async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      row("drv-1", D15, 240),
      row("drv-1", D16, 120),
      row("drv-1", D16, 180),
    ]);

    const bill = await computeMonthlyBill({ tenantId: TENANT, yearMonth: "2026-10" });

    expect(bill.activeCouriers).toBe(1);
  });
});

describe("isCourierActiveThisMonth", () => {
  test("true when one day's slots reach four hours together", async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      { date: D15, actualHoursMinutes: 120 },
      { date: D15, actualHoursMinutes: 180 },
    ]);
    await expect(isCourierActiveThisMonth(TENANT, "drv-1", "2026-10")).resolves.toBe(true);
  });

  test("false when the minutes are spread over days", async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      { date: D15, actualHoursMinutes: 200 },
      { date: D16, actualHoursMinutes: 200 },
    ]);
    await expect(isCourierActiveThisMonth(TENANT, "drv-1", "2026-10")).resolves.toBe(false);
  });
});
