/**
 * Phase 7 Wave 0 — shared backend test fixture for the Live Floor.
 *
 * 10 couriers distributed across all four platforms (KEETA, TALABAT,
 * DELIVEROO, AMERICANA). Distribution is deliberate so the same
 * fixture drives every RED test deterministically:
 *
 *   - 4 fresh working (1 per platform)  -> green dots in UI
 *   - 2 stale (>10 min since lastGpsAt) -> red dots
 *   - 1 scheduled-not-online            -> blue dot (Shift row but no
 *                                          CourierOnlineSession row)
 *   - 1 high-rejection Keeta driver     -> feeds orderRejection counter
 *                                          (5 rejectedAuto today)
 *   - 2 idle online                     -> grey dots (no ordersDelivered)
 *
 * Mirrors frontend/src/__tests__/fixtures/floorCouriers.ts (same 10
 * couriers, same stale/scheduled distribution). Backend tests assert
 * the snapshot/counter API shapes; frontend tests assert the rendered
 * component state from the same canonical data.
 *
 * REQ-floor-live-map.
 */

export type CourierFixture = {
  driverId: string;
  tenantId: string;
  name: string;
  phone: string;
  platform: "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA";
  vehicleType: "MOTORCYCLE" | "CAR";
  zone: string;
  lat: number;
  lng: number;
  /** null = never reported; >10 min ago = stale. */
  lastGpsAt: Date | null;
  area: string | null;
  isOnline: boolean;
  /** Present + isOnline=false = scheduled-not-online. */
  scheduledShiftStart: Date | null;
  /** Keeta-only field; >=3 trips the orderRejection counter. */
  todayRejectedAuto: number;
};

// Anchor "now" to a deterministic instant so stale/fresh windows are
// reproducible across CI runs. The tests that need a moving clock can
// override via jest.useFakeTimers().
const now = new Date("2026-05-13T14:00:00.000Z");
const fresh = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago — fresh
const stale = new Date(now.getTime() - 15 * 60 * 1000); // 15 min ago — stale
const shiftAgo = new Date(now.getTime() - 30 * 60 * 1000); // shift started 30 min ago

export const FLOOR_FIXTURE_TIMESTAMPS = { now, fresh, stale, shiftAgo };

export function buildFloorCourierFixture(tenantId = "tenA"): CourierFixture[] {
  return [
    // 4 fresh working — one per platform
    {
      driverId: "drv-keeta-1",
      tenantId,
      name: "Mohamed Ali",
      phone: "+96599000001",
      platform: "KEETA",
      vehicleType: "MOTORCYCLE",
      zone: "Hawally",
      lat: 29.331,
      lng: 48.029,
      lastGpsAt: fresh,
      area: "Hawally",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    {
      driverId: "drv-talabat-1",
      tenantId,
      name: "Hassan Said",
      phone: "+96599000002",
      platform: "TALABAT",
      vehicleType: "CAR",
      zone: "Salmiya",
      lat: 29.336,
      lng: 48.073,
      lastGpsAt: fresh,
      area: "Salmiya",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    {
      driverId: "drv-deliveroo-1",
      tenantId,
      name: "Khalid Nasser",
      phone: "+96599000003",
      platform: "DELIVEROO",
      vehicleType: "MOTORCYCLE",
      zone: "Jabriya",
      lat: 29.314,
      lng: 48.034,
      lastGpsAt: fresh,
      area: "Jabriya",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    {
      driverId: "drv-americana-1",
      tenantId,
      name: "Yousef Adel",
      phone: "+96599000004",
      platform: "AMERICANA",
      vehicleType: "MOTORCYCLE",
      zone: "Avenues",
      lat: 29.302,
      lng: 47.929,
      lastGpsAt: fresh,
      area: "Avenues",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    // 2 stale (>10 min) — red dots in the UI
    {
      driverId: "drv-stale-1",
      tenantId,
      name: "Abdullah Z",
      phone: "+96599000005",
      platform: "KEETA",
      vehicleType: "MOTORCYCLE",
      zone: "Hawally",
      lat: 29.330,
      lng: 48.030,
      lastGpsAt: stale,
      area: "Hawally",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    {
      driverId: "drv-stale-2",
      tenantId,
      name: "Saud K",
      phone: "+96599000006",
      platform: "TALABAT",
      vehicleType: "CAR",
      zone: "Salmiya",
      lat: 29.337,
      lng: 48.074,
      lastGpsAt: stale,
      area: "Salmiya",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    // 1 scheduled-not-online — Shift row exists but no CourierOnlineSession
    {
      driverId: "drv-scheduled-1",
      tenantId,
      name: "Nasser M",
      phone: "+96599000007",
      platform: "DELIVEROO",
      vehicleType: "MOTORCYCLE",
      zone: "Hawally",
      lat: 0,
      lng: 0,
      lastGpsAt: null,
      area: null,
      isOnline: false,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    // 1 high-rejection Keeta driver — feeds the orderRejection counter
    {
      driverId: "drv-reject-1",
      tenantId,
      name: "Bader O",
      phone: "+96599000008",
      platform: "KEETA",
      vehicleType: "MOTORCYCLE",
      zone: "Hawally",
      lat: 29.328,
      lng: 48.027,
      lastGpsAt: fresh,
      area: "Hawally",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 5,
    },
    // 2 idle online — no current order, grey dot in UI
    {
      driverId: "drv-idle-1",
      tenantId,
      name: "Faisal R",
      phone: "+96599000009",
      platform: "AMERICANA",
      vehicleType: "CAR",
      zone: "Jabriya",
      lat: 29.315,
      lng: 48.036,
      lastGpsAt: fresh,
      area: "Jabriya",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
    {
      driverId: "drv-idle-2",
      tenantId,
      name: "Talal H",
      phone: "+96599000010",
      platform: "KEETA",
      vehicleType: "MOTORCYCLE",
      zone: "Avenues",
      lat: 29.303,
      lng: 47.928,
      lastGpsAt: fresh,
      area: "Avenues",
      isOnline: true,
      scheduledShiftStart: shiftAgo,
      todayRejectedAuto: 0,
    },
  ];
}

/**
 * Convenience helper to project a fixture into the shape returned by
 * CourierOnlineSession.findMany (excludes the scheduled-not-online
 * courier, since they have no session row).
 */
export function buildOnlineSessionRows(tenantId = "tenA") {
  return buildFloorCourierFixture(tenantId)
    .filter((c) => c.isOnline)
    .map((c) => ({
      id: `sess-${c.driverId}`,
      tenantId: c.tenantId,
      driverId: c.driverId,
      startTime: c.scheduledShiftStart ?? FLOOR_FIXTURE_TIMESTAMPS.shiftAgo,
      endTime: null,
      isOnline: true,
      lastGpsAt: c.lastGpsAt,
      lastGpsLat: c.lat,
      lastGpsLng: c.lng,
      area: c.area,
      driver: {
        id: c.driverId,
        tenantId: c.tenantId,
        name: c.name,
        phone: c.phone,
        platform: c.platform,
        vehicleType: c.vehicleType,
        zone: c.zone,
      },
    }));
}
