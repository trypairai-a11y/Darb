/**
 * Phase 7 Wave 0 — shared frontend test fixture for the Live Floor.
 *
 * Mirrors backend/src/__tests__/fixtures/floorCouriers.ts — same 10
 * couriers, same stale/scheduled distribution. Used by every
 * component test in src/__tests__/components/floor/.
 *
 * The backend fixture stores Date objects (for Prisma); the frontend
 * fixture stores ISO strings (because the snapshot API serialises
 * them over the wire).
 *
 * Distribution (matches backend):
 *   - 4 fresh working (1 per platform)
 *   - 2 stale (lastGpsAt 15 min ago)
 *   - 1 scheduled-not-online (omitted from snapshot — listed separately)
 *   - 1 high-rejection Keeta driver (todayStats.ordersRejected: 5)
 *   - 2 idle online (ordersDelivered: 0)
 *
 * REQ-floor-live-map.
 */

export type CourierPlatform = "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA";

export type CourierSnapshot = {
  driverId: string;
  name: string;
  phone: string;
  platform: CourierPlatform;
  vehicleType: "MOTORCYCLE" | "CAR";
  area: string | null;
  lat: number;
  lng: number;
  /** ISO string; null = never reported. */
  lastGpsAt: string | null;
  isOnline: boolean;
  todayStats?: {
    ordersDelivered?: number;
    ordersRejected?: number;
    onlineMinutes?: number;
  };
};

const t = new Date("2026-05-13T14:00:00.000Z").getTime();
const fresh = new Date(t - 2 * 60 * 1000).toISOString();
const stale = new Date(t - 15 * 60 * 1000).toISOString();

export const FLOOR_FIXTURE_TIMESTAMPS = { now: t, fresh, stale };

/**
 * The 9 couriers that come back from GET /api/floor/snapshot — every
 * courier with isOnline=true. The scheduled-not-online driver is
 * tracked in FLOOR_SCHEDULED_NOT_ONLINE below (they have a Shift row
 * but no CourierOnlineSession row, so /snapshot doesn't surface them).
 */
export const FLOOR_COURIER_FIXTURE: CourierSnapshot[] = [
  {
    driverId: "drv-keeta-1",
    name: "Mohamed Ali",
    phone: "+96599000001",
    platform: "KEETA",
    vehicleType: "MOTORCYCLE",
    area: "Hawally",
    lat: 29.331,
    lng: 48.029,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 24, ordersRejected: 0, onlineMinutes: 240 },
  },
  {
    driverId: "drv-talabat-1",
    name: "Hassan Said",
    phone: "+96599000002",
    platform: "TALABAT",
    vehicleType: "CAR",
    area: "Salmiya",
    lat: 29.336,
    lng: 48.073,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 18, ordersRejected: 0, onlineMinutes: 210 },
  },
  {
    driverId: "drv-deliveroo-1",
    name: "Khalid Nasser",
    phone: "+96599000003",
    platform: "DELIVEROO",
    vehicleType: "MOTORCYCLE",
    area: "Jabriya",
    lat: 29.314,
    lng: 48.034,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 12, ordersRejected: 0, onlineMinutes: 180 },
  },
  {
    driverId: "drv-americana-1",
    name: "Yousef Adel",
    phone: "+96599000004",
    platform: "AMERICANA",
    vehicleType: "MOTORCYCLE",
    area: "Avenues",
    lat: 29.302,
    lng: 47.929,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 16, ordersRejected: 0, onlineMinutes: 220 },
  },
  {
    driverId: "drv-stale-1",
    name: "Abdullah Z",
    phone: "+96599000005",
    platform: "KEETA",
    vehicleType: "MOTORCYCLE",
    area: "Hawally",
    lat: 29.330,
    lng: 48.030,
    lastGpsAt: stale,
    isOnline: true,
    todayStats: { ordersDelivered: 8, ordersRejected: 0, onlineMinutes: 90 },
  },
  {
    driverId: "drv-stale-2",
    name: "Saud K",
    phone: "+96599000006",
    platform: "TALABAT",
    vehicleType: "CAR",
    area: "Salmiya",
    lat: 29.337,
    lng: 48.074,
    lastGpsAt: stale,
    isOnline: true,
    todayStats: { ordersDelivered: 5, ordersRejected: 0, onlineMinutes: 80 },
  },
  {
    driverId: "drv-reject-1",
    name: "Bader O",
    phone: "+96599000008",
    platform: "KEETA",
    vehicleType: "MOTORCYCLE",
    area: "Hawally",
    lat: 29.328,
    lng: 48.027,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 10, ordersRejected: 5, onlineMinutes: 200 },
  },
  {
    driverId: "drv-idle-1",
    name: "Faisal R",
    phone: "+96599000009",
    platform: "AMERICANA",
    vehicleType: "CAR",
    area: "Jabriya",
    lat: 29.315,
    lng: 48.036,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 0, ordersRejected: 0, onlineMinutes: 60 },
  },
  {
    driverId: "drv-idle-2",
    name: "Talal H",
    phone: "+96599000010",
    platform: "KEETA",
    vehicleType: "MOTORCYCLE",
    area: "Avenues",
    lat: 29.303,
    lng: 47.928,
    lastGpsAt: fresh,
    isOnline: true,
    todayStats: { ordersDelivered: 0, ordersRejected: 0, onlineMinutes: 45 },
  },
];

/** Scheduled-not-online — listed separately (not in /snapshot). */
export const FLOOR_SCHEDULED_NOT_ONLINE = {
  driverId: "drv-scheduled-1",
  name: "Nasser M",
  platform: "DELIVEROO" as const,
};

/** Expected counter aggregate for the fixture. */
export const FLOOR_COUNTERS = {
  scheduledNotOnline: 1,
  gpsStale: 2,
  orderRejection: 1,
};

/** Kuwait City map center used by LiveFloorMap (RESEARCH §Code Examples). */
export const KUWAIT_CITY_CENTER: [number, number] = [29.3759, 47.9774];
export const KUWAIT_CITY_ZOOM = 11;
