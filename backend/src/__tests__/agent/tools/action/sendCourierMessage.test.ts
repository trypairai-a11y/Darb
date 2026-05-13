// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (sendCourierMessage tool).
// Do not skip.
//
// Behavior contract (REQ-agent-action-tools + Wave 4 B1 — NotificationDelivery
// reuse, NOT a new model):
//   1. Zod requires notificationId (from a prior draftCourierMessage
//      Notification.id) OR {driverId + bodyEnglish} pair.
//   2. execute loads Notification tenant-scoped (when notificationId
//      provided); throws on cross-tenant.
//   3. execute enqueues NotificationDelivery {tenantId, channel:'WHATSAPP',
//      recipient, body, status:'QUEUED', idempotencyKey, sourceType:
//      'agentRunId', sourceId: ctx.runId} — Phase 9 worker drains QUEUED.
//   4. execute is idempotent via existing `idempotencyKey @unique` — a
//      second invocation with the same notificationId returns the existing
//      deliveryId (no duplicate row).
//   5. Returns { ok:true, deliveryId, channel:'WHATSAPP' }.

import { prisma } from "../../../mocks/config";
import { sendCourierMessage } from "../../../../agent/tools/action/sendCourierMessage";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

describe("Phase 8 / REQ-agent-action-tools: sendCourierMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).notification = {
      findFirst: jest.fn().mockResolvedValue({
        id: "notif-1",
        tenantId: TENANT_A,
        type: "AGENT_DRAFT_WARN_LATE_CLOCKIN",
        message: "Hi Mohamed, please clock in on time.",
        metadata: {
          driverId: "drv_xy12",
          driverPhone: "+96599887766",
          channel: "WHATSAPP",
        },
      }),
      create: jest.fn(),
    };
    (prisma as any).notificationDelivery = {
      create: jest.fn().mockResolvedValue({ id: "delivery-1" }),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      phone: "+96599887766",
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod accepts notificationId-only input AND {driverId + bodyEnglish} input", () => {
    expect(
      sendCourierMessage.inputValidator.safeParse({
        notificationId: "notif-1",
      }).success,
    ).toBe(true);
    expect(
      sendCourierMessage.inputValidator.safeParse({
        driverId: "drv_xy12",
        bodyEnglish: "Hi please clock in on time — late this week",
      }).success,
    ).toBe(true);
    // both missing → reject
    expect(
      sendCourierMessage.inputValidator.safeParse({}).success,
    ).toBe(false);
  });

  test("execute loads Notification tenant-scoped (when notificationId provided); rejects cross-tenant", async () => {
    (prisma as any).notification.findFirst.mockResolvedValue(null);
    const result = await sendCourierMessage.execute(
      { ...ctx, tenantId: TENANT_B },
      { notificationId: "notif-1" },
    );
    expect((prisma as any).notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "notif-1",
          tenantId: TENANT_B,
        }),
      }),
    );
    expect((result as any).ok).toBe(false);
  });

  test("execute enqueues NotificationDelivery with the EXISTING shape (channel=WHATSAPP, status=QUEUED, idempotencyKey, sourceType, sourceId)", async () => {
    await sendCourierMessage.execute(ctx, { notificationId: "notif-1" });
    const call = (prisma as any).notificationDelivery.create.mock.calls[0][0];
    expect(call.data).toEqual(
      expect.objectContaining({
        tenantId: TENANT_A,
        channel: "WHATSAPP",
        status: "QUEUED",
        recipient: "+96599887766",
        idempotencyKey: "notif-1",
        sourceType: "agentRunId",
        sourceId: "run-1",
      }),
    );
  });

  test("execute is idempotent via the existing idempotencyKey @unique — second invocation returns existing deliveryId", async () => {
    // First call returns nothing existing.
    (prisma as any).notificationDelivery.findFirst.mockResolvedValueOnce(null);
    await sendCourierMessage.execute(ctx, { notificationId: "notif-1" });
    // Second call finds the existing row.
    (prisma as any).notificationDelivery.findFirst.mockResolvedValueOnce({
      id: "delivery-1",
      idempotencyKey: "notif-1",
      status: "QUEUED",
    });
    // Simulate the second create raising a P2002 to prove the tool catches it.
    (prisma as any).notificationDelivery.create.mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ["idempotencyKey"] },
    });
    const result2 = await sendCourierMessage.execute(ctx, {
      notificationId: "notif-1",
    });
    expect((result2 as any).ok).toBe(true);
    expect((result2 as any).deliveryId).toBe("delivery-1");
  });

  test("execute returns { ok:true, deliveryId, channel:'WHATSAPP' }", async () => {
    const result = await sendCourierMessage.execute(ctx, {
      notificationId: "notif-1",
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        deliveryId: expect.any(String),
        channel: "WHATSAPP",
      }),
    );
  });
});

// RED — turned GREEN by Wave 1 (sendCourierMessage.ts; NotificationDelivery is reused, not redeclared).
