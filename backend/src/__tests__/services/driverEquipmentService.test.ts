/**
 * Osama, 2026-10-15: "for the driver equipment must be able to remove it from
 * the driver or replace it with a new one with a log of past equipment".
 *
 * Return: OK goes back on the shelf, DAMAGED and LOST are written off.
 * Replace: a new unit is claimed from stock first; no stock is a 409 with
 * nothing changed. Both write one line to the equipment log.
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import {
  listDriverEquipmentHistory,
  replaceDriverEquipment,
  returnDriverEquipment,
} from "../../services/equipment/driverEquipmentService";

const prisma = getMockPrisma();

beforeEach(() => {
  resetAllMocks();
  const p = prisma as any;
  p.driverInventory = { createMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() };
  p.platformInventory = { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  p.driverEquipmentEvent = { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn() };
  p.user = { ...(p.user ?? {}), findMany: jest.fn() };
  p.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(p));
  p.driver.findFirst.mockResolvedValue({ id: "d1", platform: "DARB" });
  p.driverInventory.findFirst.mockResolvedValue({
    id: "inv1",
    itemType: "HELMET",
    quantity: 2,
    issued: true,
    returnedDate: null,
  });
  p.driverInventory.updateMany.mockResolvedValue({ count: 1 });
  p.platformInventory.findFirst.mockResolvedValue({ id: "pool1", available: 3, issued: 4, total: 7, label: "Helmet" });
  p.platformInventory.updateMany.mockResolvedValue({ count: 1 });
});

describe("returnDriverEquipment", () => {
  it("returns part of the kit in good order: back in stock, driver keeps the rest", async () => {
    const p = prisma as any;
    const out = await returnDriverEquipment({
      tenantId: "t1",
      driverId: "d1",
      inventoryId: "inv1",
      quantity: 1,
      condition: "OK",
      note: "  spare  ",
      actorUserId: "u1",
    });

    expect(out).toMatchObject({ returned: 1, remaining: 1, condition: "OK" });
    expect(p.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", tenantId: "t1" } }),
    );
    expect(p.driverInventory.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", driverId: "d1", quantity: 2, issued: true, returnedDate: null },
      data: { quantity: 1 },
    });
    expect(p.platformInventory.updateMany).toHaveBeenCalledWith({
      where: { id: "pool1", issued: { gte: 1 } },
      data: { issued: { decrement: 1 }, available: { increment: 1 } },
    });
    expect(p.driverEquipmentEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "t1",
          driverId: "d1",
          itemType: "HELMET",
          action: "RETURNED",
          quantity: 1,
          condition: "OK",
          note: "spare",
          actorUserId: "u1",
        }),
      ],
    });
  });

  it("defaults to everything held, closes the row and writes damaged kit off", async () => {
    const p = prisma as any;
    await returnDriverEquipment({
      tenantId: "t1",
      driverId: "d1",
      inventoryId: "inv1",
      condition: "DAMAGED",
      actorUserId: "u1",
    });

    expect(p.driverInventory.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "inv1", quantity: 2 }),
      data: { quantity: 0, issued: false, returnedDate: expect.any(Date) },
    });
    // Not back in stock: issued and total drop, available does not move.
    expect(p.platformInventory.updateMany).toHaveBeenCalledWith({
      where: { id: "pool1", issued: { gte: 2 }, total: { gte: 2 } },
      data: { issued: { decrement: 2 }, total: { decrement: 2 } },
    });
  });

  it("clamps a pool whose issued count is already lower than the return", async () => {
    const p = prisma as any;
    p.platformInventory.updateMany.mockResolvedValueOnce({ count: 0 });
    p.platformInventory.findUnique.mockResolvedValue({ issued: 0, total: 3 });
    await returnDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "OK", actorUserId: null });
    expect(p.platformInventory.update).toHaveBeenCalledWith({
      where: { id: "pool1" },
      data: { issued: 0, available: { increment: 2 } },
    });
  });

  it("rejects a bad condition and a quantity above what the driver holds", async () => {
    await expect(
      returnDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "BROKEN", actorUserId: null }),
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_CONDITION" });
    await expect(
      returnDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", quantity: 3, condition: "OK", actorUserId: null }),
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_QUANTITY" });
  });

  it("404s a driver from another tenant and 409s an item already returned", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce(null);
    await expect(
      returnDriverEquipment({ tenantId: "t2", driverId: "d1", inventoryId: "inv1", condition: "OK", actorUserId: null }),
    ).rejects.toMatchObject({ statusCode: 404 });

    p.driverInventory.findFirst.mockResolvedValueOnce({
      id: "inv1",
      itemType: "HELMET",
      quantity: 0,
      issued: false,
      returnedDate: new Date(),
    });
    await expect(
      returnDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "OK", actorUserId: null }),
    ).rejects.toMatchObject({ statusCode: 409, code: "NOT_HELD" });
  });

  it("409s when the row changed between the read and the write, and logs nothing", async () => {
    const p = prisma as any;
    p.driverInventory.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      returnDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "OK", actorUserId: null }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CHANGED" });
    expect(p.driverEquipmentEvent.createMany).not.toHaveBeenCalled();
  });
});

describe("replaceDriverEquipment", () => {
  it("claims a new unit, writes the lost one off and logs one REPLACED line", async () => {
    const p = prisma as any;
    const out = await replaceDriverEquipment({
      tenantId: "t1",
      driverId: "d1",
      inventoryId: "inv1",
      condition: "LOST",
      note: "left at a shop",
      actorUserId: "u1",
    });

    expect(out).toMatchObject({ replaced: 1, condition: "LOST" });
    expect(p.platformInventory.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "pool1", available: { gte: 1 } },
      data: { available: { decrement: 1 }, issued: { increment: 1 } },
    });
    expect(p.platformInventory.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "pool1", issued: { gte: 1 }, total: { gte: 1 } },
      data: { issued: { decrement: 1 }, total: { decrement: 1 } },
    });
    // The driver's quantity does not move; the row now describes a new unit.
    const rowWrite = p.driverInventory.updateMany.mock.calls[0][0];
    expect(rowWrite.data).not.toHaveProperty("quantity");
    expect(rowWrite.data).toMatchObject({ condition: "OK", conditionNote: null });
    expect(p.driverEquipmentEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: "REPLACED", quantity: 1, condition: "LOST", note: "left at a shop" })],
    });
  });

  it("409s with nothing changed when there is no stock", async () => {
    const p = prisma as any;
    p.platformInventory.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      replaceDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "DAMAGED", actorUserId: "u1" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "NO_STOCK" });
    expect(p.platformInventory.updateMany).toHaveBeenCalledTimes(1);
    expect(p.driverInventory.updateMany).not.toHaveBeenCalled();
    expect(p.driverEquipmentEvent.createMany).not.toHaveBeenCalled();
  });

  it("409s when the item has no stock pool at all", async () => {
    const p = prisma as any;
    p.platformInventory.findFirst.mockResolvedValue(null);
    await expect(
      replaceDriverEquipment({ tenantId: "t1", driverId: "d1", inventoryId: "inv1", condition: "OK", actorUserId: "u1" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "NO_STOCK" });
  });
});

describe("listDriverEquipmentHistory", () => {
  it("returns events newest first with the actor's name, tenant-scoped", async () => {
    const p = prisma as any;
    p.driverEquipmentEvent.findMany.mockResolvedValue([
      {
        id: "e2",
        itemType: "HELMET",
        action: "REPLACED",
        quantity: 1,
        condition: "DAMAGED",
        note: null,
        actorUserId: "u1",
        createdAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "e1",
        itemType: "HELMET",
        action: "ISSUED",
        quantity: 2,
        condition: null,
        note: null,
        actorUserId: null,
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: "u1", name: "Osama" }]);

    const rows = await listDriverEquipmentHistory({ tenantId: "t1", driverId: "d1" });

    expect(p.driverEquipmentEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", driverId: "d1" }, orderBy: { createdAt: "desc" } }),
    );
    expect(p.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["u1"] }, tenantId: "t1" } }),
    );
    expect(rows[0]).toMatchObject({ id: "e2", actor: { id: "u1", name: "Osama" }, createdAt: "2026-10-15T10:00:00.000Z" });
    expect(rows[1]).toMatchObject({ id: "e1", actor: null });
  });
});
