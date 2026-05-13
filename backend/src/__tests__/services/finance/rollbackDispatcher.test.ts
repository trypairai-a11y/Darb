// Phase 8 Wave 0 RED test — turned GREEN by Wave 4 (rollbackDispatcher.ts
// exports REVERSERS table with 9 entries). Do not skip.
//
// Behavior contract (REQ-agent-action-tools / Pitfall 3 — soft rollback
// only; never prisma.*.delete; cash + payroll throw 'requires manual
// reversal'):
//   - REVERSERS is an object with keys exactly: draftCourierMessage,
//     applyPenalty, suspendDriver, reassignShift, sendCourierMessage,
//     createTrainingTask, escalateToHumanSupervisor, recordCashSettlement,
//     generatePayrollAdjustment.
//   - REVERSERS.applyPenalty -> prisma.penalty.updateMany {id:subjectId,
//     tenantId} -> {penaltyStatus:'OVERTURNED'}. NEVER prisma.penalty.delete.
//   - REVERSERS.suspendDriver -> prisma.driver.updateMany -> {status:'ACTIVE'}.
//   - REVERSERS.reassignShift reads previousDriverId from
//     audit.originalProposal -> Shift.updateMany -> {driverId:
//     previousDriverId}; throws when previousDriverId absent (defensive).
//   - REVERSERS.recordCashSettlement THROWS Error('Cash settlement rollback
//     requires accountant manual reversal') — canonical message per W5.
//   - REVERSERS.generatePayrollAdjustment throws when PayrollRun.status=
//     FROZEN; otherwise marks PayrollAdjustment.status='REVERSED'.
//   - REVERSERS.sendCourierMessage soft-rolls via Notification.type prefix
//     'AGENT_SEND_ROLLED_BACK_'; NotificationDelivery row is NOT mutated
//     (the existing NotificationDeliveryStatus enum has no CANCELLED value).
//   - REVERSERS.createTrainingTask -> TrainingTask.updateMany {status:
//     'CANCELLED'}.
//   - REVERSERS.escalateToHumanSupervisor is a no-op reverser (returns
//     without throwing); audit.rolledBackAt is stamped by the caller.

import { prisma } from "../../mocks/config";
import { REVERSERS } from "../../../services/finance/rollbackDispatcher";

const TENANT = "tenant-A";
const USER = "user-42";

const baseAudit = {
  id: "audit-1",
  tenantId: TENANT,
  toolName: "applyPenalty",
  subjectType: "Penalty",
  subjectId: "penalty-77",
  originalProposal: { driverId: "drv_xy12" },
  agentRunId: "run-1",
};

describe("Phase 8 / REQ-agent-action-tools: REVERSERS table", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).penalty = { updateMany: jest.fn(), update: jest.fn() };
    (prisma as any).driver = {
      ...prisma.driver,
      updateMany: jest.fn(),
    };
    (prisma.shift as any).updateMany = jest.fn();
    (prisma as any).trainingTask = { updateMany: jest.fn() };
    (prisma as any).notification = { update: jest.fn(), updateMany: jest.fn() };
    (prisma as any).payrollRun = {
      findFirst: jest.fn().mockResolvedValue({ status: "DRAFT" }),
    };
    (prisma as any).payrollAdjustment = {
      update: jest.fn(),
      updateMany: jest.fn(),
    };
  });

  test("REVERSERS has keys exactly for the 9 reversible Phase 8 tools", () => {
    expect(REVERSERS).toBeDefined();
    const keys = Object.keys(REVERSERS).sort();
    const expected = [
      "draftCourierMessage",
      "applyPenalty",
      "suspendDriver",
      "reassignShift",
      "sendCourierMessage",
      "createTrainingTask",
      "escalateToHumanSupervisor",
      "recordCashSettlement",
      "generatePayrollAdjustment",
    ].sort();
    expect(keys).toEqual(expected);
  });

  test("REVERSERS.applyPenalty -> Penalty.updateMany {id, tenantId} -> {penaltyStatus:'OVERTURNED'} (NEVER prisma.penalty.delete)", async () => {
    await REVERSERS.applyPenalty(baseAudit, TENANT, USER);
    expect((prisma as any).penalty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "penalty-77",
          tenantId: TENANT,
        }),
        data: expect.objectContaining({ penaltyStatus: "OVERTURNED" }),
      }),
    );
    // Explicit anti-pattern guard:
    expect((prisma as any).penalty.delete).toBeUndefined();
  });

  test("REVERSERS.suspendDriver -> prisma.driver.updateMany {id, tenantId} -> {status:'ACTIVE'}", async () => {
    const audit = {
      ...baseAudit,
      toolName: "suspendDriver",
      subjectType: "Driver",
      subjectId: "drv_xy12",
    };
    await REVERSERS.suspendDriver(audit, TENANT, USER);
    expect((prisma.driver as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "drv_xy12",
          tenantId: TENANT,
        }),
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  test("REVERSERS.reassignShift reads previousDriverId from audit.originalProposal; throws when absent", async () => {
    const audit = {
      ...baseAudit,
      toolName: "reassignShift",
      subjectType: "Shift",
      subjectId: "shift-1",
      originalProposal: { previousDriverId: "drv_old" },
    };
    await REVERSERS.reassignShift(audit, TENANT, USER);
    expect((prisma.shift as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "shift-1",
          tenantId: TENANT,
        }),
        data: expect.objectContaining({ driverId: "drv_old" }),
      }),
    );

    // Missing previousDriverId -> throws defensive error.
    const auditMissing = {
      ...audit,
      originalProposal: { somethingElse: "x" },
    };
    await expect(
      REVERSERS.reassignShift(auditMissing, TENANT, USER),
    ).rejects.toThrow(/previousDriverId/i);
  });

  test("REVERSERS.recordCashSettlement THROWS canonical 'Cash settlement rollback requires accountant manual reversal'", async () => {
    const audit = {
      ...baseAudit,
      toolName: "recordCashSettlement",
      subjectType: "CashRecord",
      subjectId: "cash-1",
    };
    await expect(
      REVERSERS.recordCashSettlement(audit, TENANT, USER),
    ).rejects.toThrow(/Cash settlement rollback requires accountant manual reversal/);
  });

  test("REVERSERS.generatePayrollAdjustment throws when PayrollRun.status='FROZEN'; otherwise marks PayrollAdjustment.status='REVERSED'", async () => {
    (prisma as any).payrollAdjustment.update = jest.fn();
    (prisma as any).payrollRun.findFirst = jest
      .fn()
      .mockResolvedValue({ status: "FROZEN" });
    const audit = {
      ...baseAudit,
      toolName: "generatePayrollAdjustment",
      subjectType: "PayrollAdjustment",
      subjectId: "adj-1",
      originalProposal: { period: "2026-W17", runId: "run-w17" },
    };
    await expect(
      REVERSERS.generatePayrollAdjustment(audit, TENANT, USER),
    ).rejects.toThrow(/frozen/i);

    (prisma as any).payrollRun.findFirst = jest
      .fn()
      .mockResolvedValue({ status: "DRAFT" });
    await REVERSERS.generatePayrollAdjustment(audit, TENANT, USER);
    expect((prisma as any).payrollAdjustment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "adj-1" }),
        data: expect.objectContaining({ status: "REVERSED" }),
      }),
    );
  });

  test("REVERSERS.sendCourierMessage soft-rolls via Notification.type prefix 'AGENT_SEND_ROLLED_BACK_'; NotificationDelivery enum is NOT mutated", async () => {
    const audit = {
      ...baseAudit,
      toolName: "sendCourierMessage",
      subjectType: "NotificationDelivery",
      subjectId: "delivery-1",
      originalProposal: { notificationId: "notif-1" },
      agentRunId: "run-1",
    };
    await REVERSERS.sendCourierMessage(audit, TENANT, USER);
    const updateCall =
      (prisma as any).notification.updateMany.mock.calls[0] ??
      (prisma as any).notification.update.mock.calls[0];
    expect(updateCall).toBeDefined();
    const dataString = JSON.stringify(updateCall[0]);
    expect(dataString).toMatch(/AGENT_SEND_ROLLED_BACK_/);
  });

  test("REVERSERS.createTrainingTask -> TrainingTask.updateMany {id, tenantId} -> {status:'CANCELLED'}", async () => {
    const audit = {
      ...baseAudit,
      toolName: "createTrainingTask",
      subjectType: "TrainingTask",
      subjectId: "tt-1",
    };
    await REVERSERS.createTrainingTask(audit, TENANT, USER);
    expect((prisma as any).trainingTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tt-1",
          tenantId: TENANT,
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });

  test("REVERSERS.escalateToHumanSupervisor is a no-op reverser — returns without throwing", async () => {
    const audit = {
      ...baseAudit,
      toolName: "escalateToHumanSupervisor",
      subjectType: "Notification",
      subjectId: "notif-99",
    };
    await expect(
      REVERSERS.escalateToHumanSupervisor(audit, TENANT, USER),
    ).resolves.not.toThrow();
  });
});

// RED — turned GREEN by Wave 4 (rollbackDispatcher.ts REVERSERS table).
