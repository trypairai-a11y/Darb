// Fleet governance (PRD §9/§11): discipline ladder thresholds, payout legs,
// and the FLEET containment mirror.

import express from "express";
import request from "supertest";
import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

const prisma = getMockPrisma();

const D = (v: string | number) => new Prisma.Decimal(v);

const {
  statusForViolationCount,
  THRESHOLDS,
  applyFleetDiscipline,
} = require("../../services/fleetDiscipline");
const { postFleetPayout } = require("../../services/fleetService");
const { WalletError } = require("../../services/wallet/walletService");
const { blockFleetOutsideAllowlist } = require("../../middleware/fleetContainment");

function attach() {
  const p = prisma as any;
  p.fleetPartner = p.fleetPartner ?? {};
  for (const fn of ["findMany", "findFirst", "updateMany"]) p.fleetPartner[fn] = jest.fn();
  p.fleetPayoutStatement = p.fleetPayoutStatement ?? {};
  for (const fn of ["findFirst", "update", "create"]) p.fleetPayoutStatement[fn] = jest.fn();
  p.violation = p.violation ?? {};
  p.violation.count = jest.fn();
  p.driver = p.driver ?? {};
  p.driver.updateMany = jest.fn();
  p.courierOnlineSession.updateMany = jest.fn();
  p.user = p.user ?? {};
  p.user.findMany = jest.fn().mockResolvedValue([{ id: "u-1" }]);
  p.notification.createMany = jest.fn().mockResolvedValue({ count: 1 });
  p.walletAccount = p.walletAccount ?? {};
  p.walletAccount.upsert = jest.fn(async ({ where }: any) => ({
    id: `acc:${where.tenantId_ownerKey.ownerKey}`, balanceKwd: D(0),
  }));
  p.walletAccount.update = jest.fn(async ({ where }: any) => ({ id: where.id, balanceKwd: D(0) }));
  p.walletTransaction = p.walletTransaction ?? {};
  p.walletTransaction.create = jest.fn(async ({ data }: any) => ({ id: "wtx-fleet", ...data }));
  p.walletEntry = p.walletEntry ?? {};
  p.walletEntry.create = jest.fn(async ({ data }: any) => ({ id: "we", ...data }));
  p.$transaction = jest.fn(async (fn: any) => fn(p));
  return p;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  attach();
});

describe("discipline ladder thresholds", () => {
  test.each([
    [0, "OK"],
    [THRESHOLDS.WARNED - 1, "OK"],
    [THRESHOLDS.WARNED, "WARNED"],
    [THRESHOLDS.THROTTLED, "THROTTLED"],
    [THRESHOLDS.SUSPENDED, "SUSPENDED"],
    [THRESHOLDS.REMOVED, "REMOVED"],
    [999, "REMOVED"],
  ])("%i violations → %s", (count, expected) => {
    expect(statusForViolationCount(count)).toBe(expected);
  });
});

describe("applyFleetDiscipline", () => {
  test("THROTTLED sets throttledUntil on the fleet's drivers", async () => {
    const p = prisma as any;
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", name: "Sidra Fleet", disciplineStatus: "WARNED" },
    ]);
    p.violation.count.mockResolvedValue(THRESHOLDS.THROTTLED);
    p.fleetPartner.updateMany.mockResolvedValue({ count: 1 });
    p.driver.updateMany.mockResolvedValue({ count: 4 });

    const changed = await applyFleetDiscipline("t-1");

    expect(changed).toBe(1);
    expect(p.fleetPartner.updateMany.mock.calls[0][0].data.disciplineStatus).toBe("THROTTLED");
    expect(p.driver.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1", fleetPartnerId: "f-1" },
        data: expect.objectContaining({ throttledUntil: expect.any(Date) }),
      }),
    );
  });

  test("SUSPENDED forces the fleet's open sessions OFFLINE", async () => {
    const p = prisma as any;
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", name: "Sidra Fleet", disciplineStatus: "THROTTLED" },
    ]);
    p.violation.count.mockResolvedValue(THRESHOLDS.SUSPENDED);
    p.fleetPartner.updateMany.mockResolvedValue({ count: 1 });

    await applyFleetDiscipline("t-1");

    expect(p.courierOnlineSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availability: "OFFLINE" } }),
    );
  });

  test("escalation-only: a quiet month never auto-de-escalates", async () => {
    const p = prisma as any;
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", name: "Sidra Fleet", disciplineStatus: "SUSPENDED" },
    ]);
    p.violation.count.mockResolvedValue(0);

    const changed = await applyFleetDiscipline("t-1");

    expect(changed).toBe(0);
    expect(p.fleetPartner.updateMany).not.toHaveBeenCalled();
  });
});

describe("postFleetPayout", () => {
  const STATEMENT = {
    id: "fs-1",
    fleetPartnerId: "f-1",
    deliveredOrders: 100,
    feePerOrderKwd: D("1.100"),
    totalKwd: D("110.000"),
    // Revision 13 (#8) — Darb cannot pay a statement the delivery company has
    // not confirmed, so the fixture that gets paid is a confirmed one. The
    // refusal itself has its own suite (routes/fleetPayoutConfirm.test.ts).
    status: "CONFIRMED",
  };

  test("legs: PLATFORM_REVENUE DEBIT (fleet cost) / PLATFORM_CLEARING CREDIT (cash out); marks PAID", async () => {
    const p = prisma as any;
    p.fleetPayoutStatement.findFirst.mockResolvedValue(STATEMENT);
    p.fleetPayoutStatement.update.mockResolvedValue({ ...STATEMENT, status: "PAID" });

    const posted = await postFleetPayout({ tenantId: "t-1", statementId: "fs-1", actorId: "u-1" });

    expect(posted).not.toBeNull();
    const header = p.walletTransaction.create.mock.calls[0][0].data;
    expect(header).toMatchObject({ type: "FLEET_PAYOUT", idempotencyKey: "fleet-payout:fs-1" });
    const entries = p.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    const byAccount = Object.fromEntries(
      entries.map((e: any) => [e.accountId, { dir: e.direction, amt: e.amountKwd.toFixed(3) }]),
    );
    expect(byAccount["acc:PLATFORM_REVENUE"]).toEqual({ dir: "DEBIT", amt: "110.000" });
    expect(byAccount["acc:PLATFORM_CLEARING"]).toEqual({ dir: "CREDIT", amt: "110.000" });
    expect(p.fleetPayoutStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PAID", payoutTxId: "wtx-fleet" } }),
    );
  });

  test("a PAID statement replays as null", async () => {
    const p = prisma as any;
    p.fleetPayoutStatement.findFirst.mockResolvedValue({ ...STATEMENT, status: "PAID" });
    expect(await postFleetPayout({ tenantId: "t-1", statementId: "fs-1", actorId: "u-1" })).toBeNull();
    expect(p.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("unknown statement throws WalletError", async () => {
    const p = prisma as any;
    p.fleetPayoutStatement.findFirst.mockResolvedValue(null);
    await expect(
      postFleetPayout({ tenantId: "t-1", statementId: "nope", actorId: "u-1" }),
    ).rejects.toThrow(WalletError);
  });
});

describe("blockFleetOutsideAllowlist (containment mirror)", () => {
  function makeApp() {
    const app = express();
    app.use(blockFleetOutsideAllowlist);
    app.get("*", (_req, res) => res.json({ ok: true }));
    return app;
  }
  const fleetToken = jwt.sign(
    { userId: "u-f", tenantId: "t-1", role: "FLEET", email: "f@x.com", fleetPartnerId: "f-1" },
    env.JWT_SECRET,
  );
  const staffToken = jwt.sign(
    { userId: "u-s", tenantId: "t-1", role: "ADMIN", email: "a@x.com" },
    env.JWT_SECRET,
  );

  test("FLEET token inside the lane passes", async () => {
    for (const path of ["/api/fleet", "/api/fleet/scorecard", "/api/auth/refresh", "/api/events"]) {
      const res = await request(makeApp()).get(path).set("Authorization", `Bearer ${fleetToken}`);
      expect(res.status).toBe(200);
    }
  });

  test("FLEET token outside the lane → 403 (including the staff /api/fleets)", async () => {
    for (const path of ["/api/fleets", "/api/orders", "/api/wallets/accounts", "/api/cockpit/summary"]) {
      const res = await request(makeApp()).get(path).set("Authorization", `Bearer ${fleetToken}`);
      expect(res.status).toBe(403);
    }
  });

  test("staff and anonymous requests are untouched", async () => {
    expect((await request(makeApp()).get("/api/orders").set("Authorization", `Bearer ${staffToken}`)).status).toBe(200);
    expect((await request(makeApp()).get("/api/orders")).status).toBe(200);
  });
});
