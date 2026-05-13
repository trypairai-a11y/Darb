// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (escalateToHumanSupervisor).
// Do not skip.
//
// Behavior contract (REQ-agent-action-tools / T-08-W1-06 mitigation —
// maxRecipients hard cap 100, default 25):
//   1. Zod requires driverId, reason (min 20 chars), maxRecipients
//      (number, default 25, hard max 100); rejects maxRecipients<1 or >100.
//   2. execute fans out a Notification {category:'IMPORTANT',
//      severity:'HIGH', title:`Escalation: ${driver.name}`, message:reason}
//      to up to input.maxRecipients users of the tenant where role IN
//      ('SUPERVISOR','OPS_MANAGER','ADMIN'), ordered by createdAt asc.
//   3. When input.maxRecipients is omitted, defaults to 25.
//   4. Returns { ok:true, notificationIds: string[], recipientCount }.
//   5. Tenant isolation: a tenant-B supervisor does NOT receive the
//      notification.

import { prisma } from "../../../mocks/config";
import { escalateToHumanSupervisor } from "../../../../agent/tools/action/escalateToHumanSupervisor";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

const validInput = {
  driverId: "drv_xy12",
  reason: "Anomalous pattern: 5 cancellations + GPS-stale x4 across one shift",
  maxRecipients: undefined as number | undefined,
};

const tenantASupervisors = Array.from({ length: 30 }, (_, i) => ({
  id: `user-A-${i}`,
  tenantId: TENANT_A,
  role: "SUPERVISOR",
  createdAt: new Date(2026, 1, i + 1),
}));

describe("Phase 8 / REQ-agent-action-tools: escalateToHumanSupervisor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
    });
    (prisma.user.findMany as jest.Mock).mockImplementation((args: any) => {
      const wantedTenant = args?.where?.tenantId ?? TENANT_A;
      if (wantedTenant === TENANT_A) {
        return Promise.resolve(tenantASupervisors.slice(0, args?.take ?? 25));
      }
      return Promise.resolve([]);
    });
    (prisma as any).notification = {
      create: jest.fn().mockImplementation(async (call: any) => ({
        id: `notif-${Math.random().toString(36).slice(2, 8)}`,
        ...call.data,
      })),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod rejects maxRecipients<1 or >100; rejects reason<20 chars", () => {
    expect(
      escalateToHumanSupervisor.inputValidator.safeParse({
        ...validInput,
        maxRecipients: 0,
      }).success,
    ).toBe(false);
    expect(
      escalateToHumanSupervisor.inputValidator.safeParse({
        ...validInput,
        maxRecipients: 101,
      }).success,
    ).toBe(false);
    expect(
      escalateToHumanSupervisor.inputValidator.safeParse({
        ...validInput,
        reason: "tiny",
      }).success,
    ).toBe(false);
  });

  test("execute fans out a Notification per supervisor with category=IMPORTANT, severity=HIGH, title contains driver name", async () => {
    await escalateToHumanSupervisor.execute(ctx, {
      ...validInput,
      maxRecipients: 5,
    });
    expect((prisma as any).notification.create).toHaveBeenCalledTimes(5);
    const firstCall = (prisma as any).notification.create.mock.calls[0][0];
    expect(firstCall.data).toEqual(
      expect.objectContaining({
        category: "IMPORTANT",
        severity: "HIGH",
        tenantId: TENANT_A,
      }),
    );
    expect(String(firstCall.data.title)).toContain("Mohamed");
  });

  test("when maxRecipients is omitted, defaults to 25", async () => {
    await escalateToHumanSupervisor.execute(ctx, validInput);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
      }),
    );
  });

  test("returns { ok:true, notificationIds[], recipientCount }", async () => {
    const result = await escalateToHumanSupervisor.execute(ctx, {
      ...validInput,
      maxRecipients: 5,
    });
    expect((result as any).ok).toBe(true);
    expect(Array.isArray((result as any).notificationIds)).toBe(true);
    expect((result as any).notificationIds.length).toBe(5);
    expect((result as any).recipientCount).toBe(5);
  });

  test("tenant isolation: a tenant-B supervisor does NOT receive the notification", async () => {
    await escalateToHumanSupervisor.execute(ctx, {
      ...validInput,
      maxRecipients: 25,
    });
    const userCall = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
    expect(userCall.where.tenantId).toBe(TENANT_A);
    // Sanity: tenant-B context should produce zero recipients.
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_B,
      name: "Mohamed",
    });
    jest.clearAllMocks();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_B,
      name: "Mohamed",
    });
    (prisma as any).notification.create = jest.fn();
    const result = await escalateToHumanSupervisor.execute(
      { ...ctx, tenantId: TENANT_B },
      { ...validInput, maxRecipients: 25 },
    );
    expect((result as any).recipientCount).toBe(0);
  });
});

// RED — turned GREEN by Wave 1 (escalateToHumanSupervisor.ts).
