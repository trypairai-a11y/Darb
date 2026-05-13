// Phase 8 Wave 0 RED test — re-asserts the Phase 2 T-02-14 dual-approval
// race against the Phase 8 live-tool set. Turns GREEN in Wave 2 when the
// approve route (refactored to dispatch into Phase 8 live tools) preserves
// the optimistic-lock pattern.
//
// Behavior contract (REQ-agent-action-tools / Pitfall 1 — dual-approval race):
//   - Two simultaneous POST /api/decisions/:id/approve calls on the same
//     applyPenalty-class PendingAgentAction:
//       1st returns 200, writes ONE Penalty row, ONE AgentAction row.
//       2nd returns 409 ('Already resolved'), writes ZERO additional rows.
//   - Implementation guard: prisma.pendingAgentAction.updateMany({
//       where:{id, resolvedAt: null}, data:{resolvedAt, ...}}) — count===1
//     for the first writer, count===0 for the second.
//   - T-02-14 invariant ALSO holds for recordCashSettlement-class card
//     (only one CashRecord update + one CashTransaction row).

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import decisionsRouter from "../../routes/decisions";

const TENANT = "tenant-A";
const USER = "user-42";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: USER, tenantId: TENANT, role: "ADMIN" };
    next();
  });
  app.use("/api/decisions", decisionsRouter);
  return app;
}

const penaltyPending = {
  id: "pa-penalty-1",
  tenantId: TENANT,
  runId: "run-1",
  agentId: "monitor",
  toolName: "applyPenalty",
  input: {
    driverId: "drv_xy12",
    penaltyType: "VIOLATION_RECORD",
    penaltyValue: "2.500",
    reason: "Late pickup recorded x3",
  },
  recommendation: "approve",
  reasoning: "Late pickup pattern detected.",
  confidence: 0.85,
  priorityScore: 0.7,
  subjectType: "Driver",
  subjectId: "drv_xy12",
  resolvedAt: null,
  resolution: null,
  overrideReason: null,
  createdAt: new Date("2026-05-09T06:31:00Z"),
};

const cashPending = {
  ...penaltyPending,
  id: "pa-cash-1",
  toolName: "recordCashSettlement",
  input: {
    cashRecordId: "cash-1",
    amountKd: 3.25,
    method: "CASH",
  },
  subjectType: "CashRecord",
  subjectId: "cash-1",
};

describe("Phase 8 / REQ-agent-action-tools: dual-approval race (T-02-14 extended)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.agentAction.create as jest.Mock).mockResolvedValue({
      id: "action-1",
    });
    (prisma as any).penalty = {
      create: jest.fn().mockResolvedValue({ id: "penalty-77" }),
    };
    (prisma.cashRecord as any).update = jest
      .fn()
      .mockResolvedValue({ id: "cash-1", status: "SETTLED" });
    (prisma as any).cashTransaction = {
      create: jest.fn().mockResolvedValue({ id: "tx-1" }),
    };
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT,
      name: "Mohamed",
      status: "ACTIVE",
    });
    (prisma.cashRecord.findFirst as jest.Mock).mockResolvedValue({
      id: "cash-1",
      tenantId: TENANT,
      driverId: "drv_xy12",
      salesAmount: "10.500",
      collectionAmount: "0.000",
      pendingDues: "10.500",
      status: "PENDING",
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("applyPenalty card: 1st approve writes ONE Penalty + ONE AgentAction; 2nd returns 409 'Already resolved'", async () => {
    (prisma.pendingAgentAction as any).findFirst = jest
      .fn()
      .mockResolvedValue(penaltyPending);
    let updateCalls = 0;
    (prisma.pendingAgentAction as any).updateMany = jest
      .fn()
      .mockImplementation(() => {
        updateCalls += 1;
        if (updateCalls === 1) return Promise.resolve({ count: 1 });
        return Promise.resolve({ count: 0 });
      });

    const app = makeApp();
    const [a, b] = await Promise.all([
      request(app).post(`/api/decisions/${penaltyPending.id}/approve`),
      request(app).post(`/api/decisions/${penaltyPending.id}/approve`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // The 200 path writes ONE Penalty + ONE AgentAction; the 409 path
    // writes zero additional rows. Across both requests:
    expect((prisma as any).penalty.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentAction.create).toHaveBeenCalledTimes(1);

    // The 409 response body MUST include the canonical 'Already resolved' string.
    const conflict = a.status === 409 ? a : b;
    expect(JSON.stringify(conflict.body)).toMatch(/Already resolved/);
  });

  test("recordCashSettlement card: T-02-14 invariant — only ONE CashRecord update + ONE CashTransaction row", async () => {
    (prisma.pendingAgentAction as any).findFirst = jest
      .fn()
      .mockResolvedValue(cashPending);
    let updateCalls = 0;
    (prisma.pendingAgentAction as any).updateMany = jest
      .fn()
      .mockImplementation(() => {
        updateCalls += 1;
        if (updateCalls === 1) return Promise.resolve({ count: 1 });
        return Promise.resolve({ count: 0 });
      });

    const app = makeApp();
    const [a, b] = await Promise.all([
      request(app).post(`/api/decisions/${cashPending.id}/approve`),
      request(app).post(`/api/decisions/${cashPending.id}/approve`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect((prisma.cashRecord as any).update).toHaveBeenCalledTimes(1);
    expect((prisma as any).cashTransaction.create).toHaveBeenCalledTimes(1);
  });
});

// RED — turned GREEN by Wave 2 (cardProjector + decisions route Phase 8 dispatch preserves optimistic-lock).
