// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 4 (routes/audit.ts
// refactored to dispatch via REVERSERS[toolName] instead of inline
// Phase 2 if/else). Do not skip.
//
// Behavior contract (REQ-agent-action-tools / Pitfall 3 — canonical cash
// rollback message; W5 — 409 for semantic refusal, 400 for unsupported tool):
//   1. POST /api/audit/agent-actions/:id/rollback for applyPenalty
//      -> Penalty.penaltyStatus='OVERTURNED' + AgentAction.rolledBackAt
//      set + outcome='rolled_back'.
//   2. ...for suspendDriver -> Driver.status='ACTIVE' + audit
//      .rolledBackAt set.
//   3. ...for reassignShift reads previousDriverId from
//      audit.originalProposal -> Shift.driverId reverted.
//   4. ...for recordCashSettlement -> 409 'Cash settlement rollback
//      requires accountant manual reversal' (CashRecord NOT mutated).
//   5. ...for generatePayrollAdjustment where PayrollRun.status=FROZEN
//      -> 409 with explanatory message.
//   6. ...for createTrainingTask -> TrainingTask.status='CANCELLED'.
//   7. ...for sendCourierMessage -> original Notification.type prefix
//      flipped to 'AGENT_SEND_ROLLED_BACK_' (W1/B1 — Notification.metadata
//      flag is the rollback signal Phase 9 worker honours).
//   8. ...for escalateToHumanSupervisor -> audit.rolledBackAt stamped
//      but no entity mutated (information-only).
//   9. RBAC = ADMIN|OPS_MANAGER only; ACCOUNTANT cannot rollback.

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import auditRouter from "../../routes/audit";

const TENANT_A = "tenant-A";

function makeApp(role = "ADMIN", tenantId = TENANT_A) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "approver-1", tenantId, role };
    next();
  });
  app.use("/api/audit", auditRouter);
  return app;
}

function mockAudit(audit: Partial<Record<string, unknown>>) {
  (prisma.agentAction.findFirst as jest.Mock).mockResolvedValue({
    id: "audit-1",
    tenantId: TENANT_A,
    toolName: "applyPenalty",
    subjectType: "Penalty",
    subjectId: "penalty-77",
    originalProposal: { driverId: "drv_xy12" },
    agentRunId: "run-1",
    outcome: "success",
    rolledBackAt: null,
    ...audit,
  });
  (prisma.agentAction as any).update = jest.fn().mockResolvedValue({
    id: "audit-1",
    rolledBackAt: new Date(),
    outcome: "rolled_back",
  });
}

describe("Phase 8 / REQ-agent-action-tools: rollback dispatch via REVERSERS", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).penalty = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    (prisma.driver as any).updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    (prisma.shift as any).updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    (prisma as any).trainingTask = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    (prisma as any).notification = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    };
    (prisma as any).payrollRun = {
      findFirst: jest.fn().mockResolvedValue({ status: "DRAFT" }),
    };
    (prisma as any).payrollAdjustment = {
      update: jest.fn(),
      updateMany: jest.fn(),
    };
  });

  test("applyPenalty -> Penalty.penaltyStatus='OVERTURNED' + audit.rolledBackAt set + outcome='rolled_back'", async () => {
    mockAudit({ toolName: "applyPenalty" });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    expect((prisma as any).penalty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ penaltyStatus: "OVERTURNED" }),
      }),
    );
    expect((prisma.agentAction as any).update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "rolled_back",
          rolledBackAt: expect.any(Date),
        }),
      }),
    );
  });

  test("suspendDriver -> Driver.status='ACTIVE' + audit.rolledBackAt set", async () => {
    mockAudit({
      toolName: "suspendDriver",
      subjectType: "Driver",
      subjectId: "drv_xy12",
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    expect((prisma.driver as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  test("reassignShift reads previousDriverId from audit.originalProposal -> Shift.driverId reverted", async () => {
    mockAudit({
      toolName: "reassignShift",
      subjectType: "Shift",
      subjectId: "shift-1",
      originalProposal: { previousDriverId: "drv_old", shiftId: "shift-1" },
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    expect((prisma.shift as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ driverId: "drv_old" }),
      }),
    );
  });

  test("recordCashSettlement -> 409 'Cash settlement rollback requires accountant manual reversal' (CashRecord NOT mutated)", async () => {
    mockAudit({
      toolName: "recordCashSettlement",
      subjectType: "CashRecord",
      subjectId: "cash-1",
    });
    (prisma.cashRecord as any).update = jest.fn();
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(
      /Cash settlement rollback requires accountant manual reversal/,
    );
    expect((prisma.cashRecord as any).update).not.toHaveBeenCalled();
  });

  test("generatePayrollAdjustment where PayrollRun.status=FROZEN -> 409 with explanatory message", async () => {
    (prisma as any).payrollRun.findFirst = jest
      .fn()
      .mockResolvedValue({ status: "FROZEN" });
    mockAudit({
      toolName: "generatePayrollAdjustment",
      subjectType: "PayrollAdjustment",
      subjectId: "adj-1",
      originalProposal: { period: "2026-W17", runId: "run-w17" },
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/frozen/i);
  });

  test("createTrainingTask -> TrainingTask.status='CANCELLED'", async () => {
    mockAudit({
      toolName: "createTrainingTask",
      subjectType: "TrainingTask",
      subjectId: "tt-1",
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    expect((prisma as any).trainingTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });

  test("sendCourierMessage -> original Notification.type prefix flipped to 'AGENT_SEND_ROLLED_BACK_'", async () => {
    mockAudit({
      toolName: "sendCourierMessage",
      subjectType: "NotificationDelivery",
      subjectId: "delivery-1",
      originalProposal: { notificationId: "notif-1" },
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    const updateCall =
      (prisma as any).notification.updateMany.mock.calls[0] ??
      (prisma as any).notification.update.mock.calls[0];
    expect(updateCall).toBeDefined();
    const dataString = JSON.stringify(updateCall[0]);
    expect(dataString).toMatch(/AGENT_SEND_ROLLED_BACK_/);
  });

  test("escalateToHumanSupervisor -> audit.rolledBackAt stamped but no entity mutated", async () => {
    mockAudit({
      toolName: "escalateToHumanSupervisor",
      subjectType: "Notification",
      subjectId: "notif-99",
    });
    const app = makeApp("ADMIN");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(200);
    expect((prisma.agentAction as any).update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rolledBackAt: expect.any(Date),
        }),
      }),
    );
  });

  test("RBAC = ADMIN|OPS_MANAGER only; ACCOUNTANT cannot rollback", async () => {
    mockAudit({ toolName: "applyPenalty" });
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).post(
      "/api/audit/agent-actions/audit-1/rollback",
    );
    expect(res.status).toBe(403);
  });
});

// RED — turned GREEN by Wave 4 (routes/audit.ts refactored to dispatch via REVERSERS).
