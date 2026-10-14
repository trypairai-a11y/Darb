/**
 * Revision 24 #13 — the map on an order's Timeline.
 *
 * Client note: "please include a map with it showing the driver path until the
 * order is delivered, and it must have the vendor location + customer location".
 *
 * The path is the driver's own GPS history (`LocationLog`, written by the
 * driver app's batched `/api/agent/location` ingest) between the moment the
 * order was assigned and the moment it ended. Points before `pickedUpAt` are
 * the ride to the shop and are flagged `leg: "TO_PICKUP"`, the rest are the
 * delivery itself (`leg: "TO_DROPOFF"`), so the map can draw the two apart.
 *
 * The read is capped: a long order on a chatty phone is thousands of rows, and
 * a polyline does not need more than a few hundred to be true to the road. The
 * thinning is even (every n-th point) and always keeps the last one, so the
 * line still ends where the driver actually was.
 */
import { prisma } from "../config";

/** Most points the map is ever sent. */
export const ROUTE_MAX_POINTS = 400;
/** Most rows read from the log before thinning. */
const ROUTE_MAX_ROWS = 5000;

export interface OrderRoutePoint {
  lat: number;
  lng: number;
  at: string;
  leg: "TO_PICKUP" | "TO_DROPOFF";
}

export interface OrderRoute {
  orderId: string;
  status: string;
  driver: { id: string; name: string } | null;
  pickup: { lat: number; lng: number; name: string; address: string | null } | null;
  dropoff: { lat: number; lng: number; address: string | null } | null;
  window: { from: string; to: string } | null;
  path: OrderRoutePoint[];
  /** True when the log held more points than were sent. */
  thinned: boolean;
}

const ENDED_AT_STATUSES = ["DELIVERED", "FAILED", "RETURNED", "CANCELLED", "REJECTED"];

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Every n-th point, always ending on the last one. */
export function thinPath<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!);
  return out;
}

export async function orderRoute(tenantId: string, orderId: string): Promise<OrderRoute | null> {
  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      status: true,
      driverId: true,
      dropoffLat: true,
      dropoffLng: true,
      dropoffAddress: true,
      assignedAt: true,
      arrivedAt: true,
      pickedUpAt: true,
      deliveredAt: true,
      returnedAt: true,
      cancelledAt: true,
      updatedAt: true,
      driver: { select: { id: true, name: true } },
      vendor: { select: { name: true } },
      branch: { select: { name: true, address: true, lat: true, lng: true } },
    },
  });
  if (!order) return null;

  const pickupLat = num(order.branch?.lat);
  const pickupLng = num(order.branch?.lng);
  const dropLat = num(order.dropoffLat);
  const dropLng = num(order.dropoffLng);

  const pickup =
    pickupLat !== null && pickupLng !== null
      ? {
          lat: pickupLat,
          lng: pickupLng,
          name: [order.vendor?.name, order.branch?.name].filter(Boolean).join(" · "),
          address: order.branch?.address ?? null,
        }
      : null;
  const dropoff =
    dropLat !== null && dropLng !== null ? { lat: dropLat, lng: dropLng, address: order.dropoffAddress ?? null } : null;

  const from = order.assignedAt ?? order.arrivedAt ?? order.pickedUpAt;
  // An order still moving is drawn up to now; an ended one up to its end.
  const ended = ENDED_AT_STATUSES.includes(order.status);
  const to =
    order.deliveredAt ??
    order.returnedAt ??
    order.cancelledAt ??
    (ended ? order.updatedAt : new Date());

  let path: OrderRoutePoint[] = [];
  let thinned = false;
  if (order.driverId && from && to && to > from) {
    const rows = await prisma.locationLog.findMany({
      where: { driverId: order.driverId, capturedAt: { gte: from, lte: to } },
      select: { latitude: true, longitude: true, capturedAt: true },
      orderBy: { capturedAt: "asc" },
      take: ROUTE_MAX_ROWS,
    });
    const pickedUpAt = order.pickedUpAt;
    const all = rows
      .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), capturedAt: r.capturedAt }))
      .filter((r): r is { lat: number; lng: number; capturedAt: Date } => r.lat !== null && r.lng !== null)
      .map<OrderRoutePoint>((r) => ({
        lat: r.lat,
        lng: r.lng,
        at: r.capturedAt.toISOString(),
        leg: pickedUpAt && r.capturedAt >= pickedUpAt ? "TO_DROPOFF" : "TO_PICKUP",
      }));
    thinned = all.length > ROUTE_MAX_POINTS;
    path = thinPath(all, ROUTE_MAX_POINTS);
  }

  return {
    orderId: order.id,
    status: order.status,
    driver: order.driver ? { id: order.driver.id, name: order.driver.name } : null,
    pickup,
    dropoff,
    window: from && to ? { from: from.toISOString(), to: to.toISOString() } : null,
    path,
    thinned,
  };
}
