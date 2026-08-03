/**
 * Driving distance for by-kilometre delivery plans — revision 4 (#7).
 *
 * The client was specific: price on "per kilometer calculated from Google Maps
 * (not the actual route the driver took)". That distinction matters. A driver
 * who detours for fuel, or who is sent back out on a second attempt, must not
 * make the delivery more expensive for the merchant. So the number that prices
 * an order is the routing distance between the pickup branch and the dropoff
 * pin, fixed at quote time and independent of what the driver actually does.
 *
 * Google is asked once per coordinate pair and the answer is cached. Repeat
 * orders from one pharmacy to one building are the common case in Kuwait, so
 * the cache carries most of the traffic and the API bill stays small.
 *
 * When Google cannot answer — no key configured, quota exhausted, network
 * failure — the quote falls back to straight-line distance and says so. A
 * priced order is better than a rejected one, and `source` travels with the
 * quote so nobody has to guess afterwards which number they are looking at.
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { haversineMeters } from "../utils/geo";

export type DistanceSource = "google" | "straight-line";

export interface DistanceResult {
  km: number;
  source: DistanceSource;
}

export interface Point {
  lat: number;
  lng: number;
}

/** ~11 m of precision. Finer than this and the cache never hits. */
function coordKey(p: Point): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

/** Cached Google answers older than this are re-fetched; roads change. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";
const REQUEST_TIMEOUT_MS = 4000;

function straightLine(origin: Point, dest: Point): DistanceResult {
  return {
    km: haversineMeters(origin.lat, origin.lng, dest.lat, dest.lng) / 1000,
    source: "straight-line",
  };
}

/**
 * Every other failure below is transient and logs on each occurrence. A missing
 * key is neither: it is permanent and silent, so it warns once per process
 * instead of on every quote, the same shape as the notification stub warning.
 * Without this the only signal that km plans are priced on straight-line
 * distance is the `source` field on a quote nobody reads.
 */
let warnedMissingKey = false;

/**
 * Ask Google for driving distance in km. Returns null on any failure so the
 * caller can fall back — this never throws, because a pricing call must not be
 * able to fail on someone else's outage.
 */
async function fetchGoogleKm(origin: Point, dest: Point): Promise<number | null> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn(
        "distanceService: GOOGLE_MAPS_API_KEY is not set, every by-km quote falls back to straight-line distance",
      );
    }
    return null;
  }

  const url =
    `${DISTANCE_MATRIX_URL}?origins=${origin.lat},${origin.lng}` +
    `&destinations=${dest.lat},${dest.lng}` +
    `&mode=driving&units=metric&key=${encodeURIComponent(env.GOOGLE_MAPS_API_KEY)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status }, "distanceService: Distance Matrix HTTP error");
      return null;
    }
    const body = (await res.json()) as {
      status?: string;
      rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: number } }> }>;
    };
    if (body.status !== "OK") {
      logger.warn({ status: body.status }, "distanceService: Distance Matrix non-OK");
      return null;
    }
    const element = body.rows?.[0]?.elements?.[0];
    if (element?.status !== "OK" || typeof element.distance?.value !== "number") {
      // ZERO_RESULTS is the honest answer for an unreachable pin, not an error.
      return null;
    }
    return element.distance.value / 1000;
  } catch (err) {
    logger.warn({ err }, "distanceService: Distance Matrix request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Driving distance in km between two points, cached per tenant.
 *
 * Only Google answers are cached. A straight-line fallback is deliberately not
 * written to the cache: caching it would freeze a degraded answer in place for
 * thirty days after the key comes back, and merchants would be billed on it.
 */
export async function drivingDistanceKm(
  tenantId: string,
  origin: Point,
  dest: Point,
): Promise<DistanceResult> {
  const originKey = coordKey(origin);
  const destKey = coordKey(dest);

  try {
    const cached = await prisma.distanceCache.findFirst({
      where: { tenantId, originKey, destKey },
    });
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      return { km: Number(cached.km), source: cached.source as DistanceSource };
    }
  } catch (err) {
    logger.warn({ err }, "distanceService: cache read failed, falling through to Google");
  }

  const googleKm = await fetchGoogleKm(origin, dest);
  if (googleKm == null) return straightLine(origin, dest);

  try {
    await prisma.distanceCache.upsert({
      where: { tenantId_originKey_destKey: { tenantId, originKey, destKey } },
      create: {
        tenantId,
        originKey,
        destKey,
        km: new Prisma.Decimal(googleKm.toFixed(3)),
        source: "google",
        fetchedAt: new Date(),
      },
      update: { km: new Prisma.Decimal(googleKm.toFixed(3)), fetchedAt: new Date() },
    });
  } catch (err) {
    // A cache that cannot be written is a performance problem, not a pricing one.
    logger.warn({ err }, "distanceService: cache write failed");
  }

  return { km: googleKm, source: "google" };
}
