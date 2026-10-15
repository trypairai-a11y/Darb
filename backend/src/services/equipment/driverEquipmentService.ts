/**
 * Osama, 2026-10-15: "for the driver equipment must be able to remove it from
 * the driver or replace it with a new one with a log of past equipment".
 *
 * Three staff actions on one DriverInventory row, each in one transaction with
 * the stock pool on /assets so the two screens never disagree:
 *
 *   return   the driver hands back some or all of an item. Back in good order
 *            (OK) it goes back on the shelf: pool available +n, issued -n.
 *            DAMAGED or LOST is written off: issued -n and total -n, never
 *            back in stock.
 *   replace  one unit swapped for a new one from stock. The new unit is
 *            claimed first with a guarded decrement on `available`; no stock
 *            means a 409 and nothing changes. The old unit is then handled
 *            like a return of one with its condition. The driver's quantity
 *            does not move.
 *   history  every DriverEquipmentEvent for the driver, newest first, with
 *            the name of the staff member who did it.
 *
 * The issue flows and the termination clearance write their own ISSUED and
 * CLEARED events through `logEquipmentEvents`.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";

export const RETURN_CONDITIONS = ["OK", "DAMAGED", "LOST"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export type EquipmentEventActionName = "ISSUED" | "RETURNED" | "REPLACED" | "CLEARED";

type Tx = Prisma.TransactionClient;

function fail(statusCode: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

export function isReturnCondition(value: unknown): value is ReturnCondition {
  return typeof value === "string" && (RETURN_CONDITIONS as readonly string[]).includes(value);
}

function cleanNote(note: unknown): string | null {
  return typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;
}

export interface EquipmentEventInput {
  tenantId: string;
  driverId: string;
  itemType: string;
  action: EquipmentEventActionName;
  quantity: number;
  condition?: string | null;
  note?: string | null;
  actorUserId?: string | null;
}

/**
 * Append events to the equipment log. Pass the transaction client so the log
 * line and the stock movement land together or not at all.
 */
export async function logEquipmentEvents(client: Tx | typeof prisma, events: EquipmentEventInput[]) {
  const rows = events.filter((e) => e.quantity > 0);
  if (rows.length === 0) return;
  await (client as Tx).driverEquipmentEvent.createMany({
    data: rows.map((e) => ({
      tenantId: e.tenantId,
      driverId: e.driverId,
      itemType: e.itemType,
      action: e.action,
      quantity: e.quantity,
      condition: e.condition ?? null,
      note: e.note ?? null,
      actorUserId: e.actorUserId ?? null,
    })),
  });
}

/**
 * The pool a driver's item belongs to. DriverInventory does not record the
 * platform it was issued from, so: the driver's own platform first, then DARB
 * (the platform in scope), then any pool of that item. Null when the item has
 * no pool at all (the driver app's default kit can predate one).
 */
async function findPool(tx: Tx, tenantId: string, itemType: string, platform: string | null) {
  const select = { id: true, available: true, issued: true, total: true, label: true } as const;
  const tries: Array<Record<string, unknown>> = [];
  if (platform) tries.push({ platform });
  if (platform !== "DARB") tries.push({ platform: "DARB" });
  tries.push({});
  for (const extra of tries) {
    const pool = await tx.platformInventory.findFirst({
      where: { tenantId, itemType, ...extra } as Prisma.PlatformInventoryWhereInput,
      select,
    });
    if (pool) return pool;
  }
  return null;
}

/**
 * Units coming off a driver. OK goes back on the shelf; anything else is
 * written off (issued and total both drop). Guarded decrements first so a
 * concurrent movement is never overwritten; a pool whose counts were typed in
 * lower than reality is clamped at zero rather than going negative.
 */
async function takeBack(tx: Tx, poolId: string, quantity: number, condition: ReturnCondition) {
  const restock = condition === "OK";
  const guarded = await tx.platformInventory.updateMany({
    where: restock
      ? { id: poolId, issued: { gte: quantity } }
      : { id: poolId, issued: { gte: quantity }, total: { gte: quantity } },
    data: restock
      ? { issued: { decrement: quantity }, available: { increment: quantity } }
      : { issued: { decrement: quantity }, total: { decrement: quantity } },
  });
  if (guarded.count > 0) return;

  const pool = await tx.platformInventory.findUnique({
    where: { id: poolId },
    select: { issued: true, total: true },
  });
  if (!pool) return;
  await tx.platformInventory.update({
    where: { id: poolId },
    data: restock
      ? { issued: Math.max(0, pool.issued - quantity), available: { increment: quantity } }
      : { issued: Math.max(0, pool.issued - quantity), total: Math.max(0, pool.total - quantity) },
  });
}

async function loadHeldItem(tenantId: string, driverId: string, inventoryId: string) {
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, platform: true },
  });
  if (!driver) fail(404, "DRIVER_NOT_FOUND", "Driver not found");
  const item = await prisma.driverInventory.findFirst({
    where: { id: inventoryId, driverId },
    select: { id: true, itemType: true, quantity: true, issued: true, returnedDate: true },
  });
  if (!item) fail(404, "ITEM_NOT_FOUND", "Equipment item not found");
  if (!item.issued || item.returnedDate || item.quantity < 1) {
    fail(409, "NOT_HELD", "This item is not with the driver any more");
  }
  return { driver, item };
}

export async function returnDriverEquipment(params: {
  tenantId: string;
  driverId: string;
  inventoryId: string;
  quantity?: unknown;
  condition: unknown;
  note?: unknown;
  actorUserId: string | null;
}) {
  const { tenantId, driverId, inventoryId } = params;
  if (!isReturnCondition(params.condition)) {
    fail(400, "BAD_CONDITION", `condition must be one of ${RETURN_CONDITIONS.join(", ")}`);
  }
  const condition = params.condition;
  const note = cleanNote(params.note);

  const { driver, item } = await loadHeldItem(tenantId, driverId, inventoryId);
  const quantity = params.quantity === undefined || params.quantity === null ? item.quantity : Number(params.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    fail(400, "BAD_QUANTITY", "quantity must be a whole number of at least 1");
  }
  if (quantity > item.quantity) {
    fail(400, "BAD_QUANTITY", `The driver only has ${item.quantity}`);
  }

  const now = new Date();
  const remaining = item.quantity - quantity;

  return prisma.$transaction(async (tx) => {
    // Guarded on the quantity we read: a second click or a concurrent issue
    // makes this count 0, and the answer is a 409 rather than a double return.
    const moved = await tx.driverInventory.updateMany({
      where: { id: item.id, driverId, quantity: item.quantity, issued: true, returnedDate: null },
      data:
        remaining === 0
          ? { quantity: 0, issued: false, returnedDate: now }
          : { quantity: remaining },
    });
    if (moved.count === 0) fail(409, "CHANGED", "This item changed a moment ago. Refresh and try again.");

    const pool = await findPool(tx, tenantId, item.itemType, driver.platform ?? null);
    if (pool) await takeBack(tx, pool.id, quantity, condition);

    await logEquipmentEvents(tx, [
      {
        tenantId,
        driverId,
        itemType: item.itemType,
        action: "RETURNED",
        quantity,
        condition,
        note,
        actorUserId: params.actorUserId,
      },
    ]);

    return { inventoryId: item.id, itemType: item.itemType, returned: quantity, remaining, condition };
  });
}

export async function replaceDriverEquipment(params: {
  tenantId: string;
  driverId: string;
  inventoryId: string;
  condition: unknown;
  note?: unknown;
  actorUserId: string | null;
}) {
  const { tenantId, driverId, inventoryId } = params;
  if (!isReturnCondition(params.condition)) {
    fail(400, "BAD_CONDITION", `condition must be one of ${RETURN_CONDITIONS.join(", ")}`);
  }
  const condition = params.condition;
  const note = cleanNote(params.note);

  const { driver, item } = await loadHeldItem(tenantId, driverId, inventoryId);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const pool = await findPool(tx, tenantId, item.itemType, driver.platform ?? null);
    const outOfStock = () =>
      fail(409, "NO_STOCK", `No ${pool?.label ?? item.itemType} in stock to replace it with. Restock it on Assets first.`);
    if (!pool) outOfStock();

    // The new unit first. Guarded, same discipline as issuing: count 0 means
    // the shelf is empty (or someone took the last one), and throwing here
    // rolls the whole swap back.
    const claimed = await tx.platformInventory.updateMany({
      where: { id: pool!.id, available: { gte: 1 } },
      data: { available: { decrement: 1 }, issued: { increment: 1 } },
    });
    if (claimed.count === 0) outOfStock();

    // The old unit comes off the driver like a return of one.
    await takeBack(tx, pool!.id, 1, condition);

    // The driver still holds the same number; the row now describes a new unit.
    const touched = await tx.driverInventory.updateMany({
      where: { id: item.id, driverId, issued: true, returnedDate: null, quantity: { gte: 1 } },
      data: { issuedDate: now, condition: "OK", conditionNote: null, conditionReportedAt: null },
    });
    if (touched.count === 0) fail(409, "CHANGED", "This item changed a moment ago. Refresh and try again.");

    await logEquipmentEvents(tx, [
      {
        tenantId,
        driverId,
        itemType: item.itemType,
        action: "REPLACED",
        quantity: 1,
        condition,
        note,
        actorUserId: params.actorUserId,
      },
    ]);

    return { inventoryId: item.id, itemType: item.itemType, replaced: 1, condition };
  });
}

export async function listDriverEquipmentHistory(params: { tenantId: string; driverId: string; limit?: number }) {
  const { tenantId, driverId } = params;
  const driver = await prisma.driver.findFirst({ where: { id: driverId, tenantId }, select: { id: true } });
  if (!driver) fail(404, "DRIVER_NOT_FOUND", "Driver not found");

  const take = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const events = await prisma.driverEquipmentEvent.findMany({
    where: { tenantId, driverId },
    orderBy: { createdAt: "desc" },
    take,
  });

  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((a) => [a.id, a.name]));

  return events.map((e) => ({
    id: e.id,
    itemType: e.itemType,
    action: e.action,
    quantity: e.quantity,
    condition: e.condition,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
    actor: e.actorUserId ? { id: e.actorUserId, name: names.get(e.actorUserId) ?? null } : null,
  }));
}
