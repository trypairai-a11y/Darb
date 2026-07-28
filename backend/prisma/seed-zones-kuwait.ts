/**
 * Kuwait zone coverage — closes the map gaps that were refusing orders.
 *
 * The Darb 2.0 foundation seed drew eight small district boxes around the
 * capital and Hawally. Everything else in the country was uncovered map, and
 * an uncovered pin is OUT_OF_ZONE_DROPOFF: the order is refused at intake and
 * parks in Needs review. That is the whole reason this file exists.
 *
 * What it does, and only this:
 *   - upserts the districts below by code (existing zones are never reshaped,
 *     so nothing that prices correctly today starts pricing differently)
 *   - fills the tenant-wide ZoneSurcharge grid for every pair it can reach,
 *     using the same distance ladder the foundation seed uses
 *
 * What it deliberately does NOT do: touch any DeliveryPlan grid. Those cells
 * are a merchant's contracted rates, and a script inventing a number there is
 * a script quietly changing what somebody gets charged. Plans with blank cells
 * show an unpriced-pair count in /pricing; a human fills them.
 *
 * The polygons are approximate district boxes, the same fidelity as the eight
 * that shipped before them. They are good enough to place a pin in the right
 * district and price it; they are not survey boundaries. /zones has a map
 * editor for adjusting any of them.
 *
 * Run: npx tsx prisma/seed-zones-kuwait.ts
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "../src/generated/prisma";
import { haversineMeters, bboxOfPolygon, GeoJsonPolygon } from "../src/utils/geo";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL +
        (process.env.DATABASE_URL?.includes("?") ? "&" : "?") +
        "connection_limit=5",
    },
  },
});

interface ZoneDef {
  code: string;
  name: string;
  nameAr: string;
  /** Centre of the district, [lng, lat]. */
  centre: [number, number];
  /** Half-width in degrees, [lng, lat]. Roughly 0.01 lng ≈ 1 km at this latitude. */
  half: [number, number];
}

/**
 * The populated belt, north to south. Sizes vary because the districts do:
 * Jahra and Ahmadi sprawl, Rumaithiya does not.
 */
const NEW_ZONES: ZoneDef[] = [
  // ── Capital + north ──────────────────────────────────────────────────────
  { code: "SULAIBIKHAT", name: "Sulaibikhat", nameAr: "الصليبيخات", centre: [47.935, 29.334], half: [0.028, 0.020] },
  { code: "JAHRA", name: "Jahra", nameAr: "الجهراء", centre: [47.670, 29.340], half: [0.055, 0.035] },
  { code: "SHUWAIKH", name: "Shuwaikh", nameAr: "الشويخ", centre: [47.945, 29.352], half: [0.025, 0.016] },

  // ── Hawally belt ─────────────────────────────────────────────────────────
  { code: "SHAAB", name: "Shaab", nameAr: "الشعب", centre: [48.048, 29.352], half: [0.018, 0.012] },
  { code: "RUMAITHIYA", name: "Rumaithiya", nameAr: "الرميثية", centre: [48.068, 29.310], half: [0.020, 0.014] },
  { code: "BAYAN", name: "Bayan", nameAr: "بيان", centre: [48.048, 29.298], half: [0.018, 0.013] },
  { code: "MESSILA", name: "Messila", nameAr: "المسيلة", centre: [48.090, 29.290], half: [0.016, 0.014] },

  // ── Farwaniya belt ───────────────────────────────────────────────────────
  { code: "KHAITAN", name: "Khaitan", nameAr: "خيطان", centre: [47.972, 29.285], half: [0.024, 0.016] },
  { code: "ARDIYA", name: "Ardiya", nameAr: "العارضية", centre: [47.918, 29.302], half: [0.024, 0.018] },
  { code: "JLEEB", name: "Jleeb Al Shuyoukh", nameAr: "جليب الشيوخ", centre: [47.918, 29.265], half: [0.026, 0.018] },
  { code: "SABAH_NASSER", name: "Sabah Al Nasser", nameAr: "صباح الناصر", centre: [47.900, 29.288], half: [0.018, 0.014] },

  // ── Mubarak Al Kabeer belt — the gap that refused DRB-DWPH-0129 ──────────
  { code: "SABAH_SALEM", name: "Sabah Al Salem", nameAr: "صباح السالم", centre: [48.065, 29.259], half: [0.024, 0.018] },
  { code: "QURAIN", name: "Qurain", nameAr: "القرين", centre: [48.048, 29.242], half: [0.018, 0.014] },
  { code: "ADAN", name: "Adan", nameAr: "العدان", centre: [48.070, 29.232], half: [0.018, 0.014] },
  { code: "FUNAITEES", name: "Funaitees", nameAr: "الفنيطيس", centre: [48.093, 29.235], half: [0.018, 0.015] },
  { code: "ABU_FTAIRA", name: "Abu Ftaira", nameAr: "أبو فطيرة", centre: [48.092, 29.256], half: [0.014, 0.012] },

  // ── Ahmadi / the coast road south ────────────────────────────────────────
  { code: "EGAILA", name: "Egaila", nameAr: "العقيلة", centre: [48.098, 29.188], half: [0.020, 0.016] },
  { code: "FINTAS", name: "Fintas", nameAr: "الفنطاس", centre: [48.118, 29.172], half: [0.016, 0.014] },
  { code: "MAHBOULA", name: "Mahboula", nameAr: "المهبولة", centre: [48.128, 29.148], half: [0.014, 0.014] },
  { code: "ABU_HALIFA", name: "Abu Halifa", nameAr: "أبو حليفة", centre: [48.128, 29.124], half: [0.014, 0.013] },
  { code: "MANGAF", name: "Mangaf", nameAr: "المنقف", centre: [48.128, 29.100], half: [0.014, 0.013] },
  { code: "FAHAHEEL", name: "Fahaheel", nameAr: "الفحيحيل", centre: [48.128, 29.078], half: [0.014, 0.013] },
  { code: "AHMADI", name: "Ahmadi", nameAr: "الأحمدي", centre: [48.083, 29.077], half: [0.028, 0.022] },
  { code: "SABAHIYA", name: "Sabahiya", nameAr: "الصباحية", centre: [48.105, 29.055], half: [0.016, 0.015] },
  { code: "FAHAD_AHMAD", name: "Fahad Al Ahmad", nameAr: "فهد الأحمد", centre: [48.088, 29.040], half: [0.016, 0.014] },

  // ── Far south ────────────────────────────────────────────────────────────
  { code: "KHIRAN", name: "Al Khiran", nameAr: "الخيران", centre: [48.365, 28.680], half: [0.060, 0.045] },
  { code: "WAFRA", name: "Wafra", nameAr: "الوفرة", centre: [47.930, 28.640], half: [0.070, 0.050] },
];

/** Axis-aligned district box as a closed GeoJSON ring, [lng, lat]. */
/**
 * Overlap is not cosmetic here. resolveZone returns the FIRST polygon whose
 * bbox and ring contain the pin, so two zones covering one point resolve by
 * whatever order the cache happens to hold — and a pin that prices as Mishref
 * today could price as its neighbour tomorrow with nothing in the diff to
 * explain it. New boxes fill gaps; they never sit on top of drawn ground.
 *
 * Checked against bounding boxes rather than exact rings, which is stricter
 * than necessary and errs toward leaving a sliver uncovered instead of
 * silently repricing somebody.
 */
type Box = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function boxOf(def: ZoneDef): Box {
  const [cx, cy] = def.centre;
  const [hx, hy] = def.half;
  return { minLng: cx - hx, minLat: cy - hy, maxLng: cx + hx, maxLat: cy + hy };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.minLng < b.maxLng && b.minLng < a.maxLng && a.minLat < b.maxLat && b.minLat < a.maxLat
  );
}

function area(b: Box): number {
  return Math.max(0, b.maxLng - b.minLng) * Math.max(0, b.maxLat - b.minLat);
}

/**
 * Pull a box back off everything already drawn.
 *
 * The district centres below are hand-placed from the map, but their extents
 * are guesses, and a guess that lands on a neighbour is the one thing we
 * cannot ship. So each box is retreated along whichever edge is cheapest to
 * give up — the smallest bite that ends the collision — until it stands
 * clear. The centre is what carries the meaning; the edges are negotiable.
 *
 * Boxes are processed in list order, so an earlier district keeps its ground
 * and a later one yields. That makes the output a pure function of the list.
 */
function clipBox(box: Box, blockers: Box[]): Box {
  let cur = { ...box };
  // Each pass resolves at least one collision; the bound is a safety net.
  for (let pass = 0; pass < blockers.length * 4 + 8; pass++) {
    const hit = blockers.find((b) => overlaps(cur, b));
    if (!hit) return cur;

    // Four ways out, each the box conceding one edge. Take the cheapest.
    const options: Box[] = [
      { ...cur, maxLng: Math.min(cur.maxLng, hit.minLng) }, // retreat from the east
      { ...cur, minLng: Math.max(cur.minLng, hit.maxLng) }, // …from the west
      { ...cur, maxLat: Math.min(cur.maxLat, hit.minLat) }, // …from the north
      { ...cur, minLat: Math.max(cur.minLat, hit.maxLat) }, // …from the south
    ];
    const best = options.reduce((a, b) => (area(a) >= area(b) ? a : b));
    if (area(best) <= 0) return best; // swallowed whole — caller drops it
    cur = best;
  }
  return cur;
}

function boxToPolygon(b: Box): GeoJsonPolygon {
  const ring: [number, number][] = [
    [b.minLng, b.minLat],
    [b.maxLng, b.minLat],
    [b.maxLng, b.maxLat],
    [b.minLng, b.maxLat],
  ];
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
}

function centreOf(b: Box): { lat: number; lng: number } {
  return {
    lat: +((b.minLat + b.maxLat) / 2).toFixed(7),
    lng: +((b.minLng + b.maxLng) / 2).toFixed(7),
  };
}

/**
 * How much of its intended footprint a district must keep to be worth drawing.
 *
 * A box hemmed in on three sides comes out of the clip as a sliver, and a
 * 600-metre ribbon labelled "Khaitan" is worse than no Khaitan at all: the
 * ground is already inside Farwaniya, which prices it correctly, while the
 * ribbon invites somebody to trust a name that covers a tenth of the district
 * it claims. Below this fraction we leave the neighbour to it.
 */
const MIN_RETAINED = 0.25;

/** Floor on absolute size too, in square degrees (~0.5 km²). */
const MIN_AREA = 0.00005;

/** Same ladder the foundation seed uses, so old and new pairs price alike. */
function surchargeFor(distanceMeters: number): string {
  if (distanceMeters <= 4_000) return "0.250";
  if (distanceMeters <= 8_000) return "0.500";
  if (distanceMeters <= 20_000) return "0.750";
  if (distanceMeters <= 40_000) return "1.250";
  return "2.000";
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const withZones: typeof tenants = [];
  for (const t of tenants) {
    const n = await prisma.deliveryZone.count({ where: { tenantId: t.id } });
    if (n > 0) withZones.push(t);
  }
  if (withZones.length === 0) throw new Error("No tenant has any zones — run seed-darb2.ts first.");

  const dryRun = process.argv.includes("--check");

  for (const tenant of withZones) {
    const tid = tenant.id;
    console.log(`\n── ${tenant.name} ──`);

    // ── Fit every new district into the ground nobody has drawn on ─────────
    const newCodes = new Set(NEW_ZONES.map((z) => z.code));
    const drawn = await prisma.deliveryZone.findMany({
      where: { tenantId: tid, isActive: true },
      select: { code: true, bbox: true },
    });
    // Re-running re-writes this script's own zones, so they are not blockers.
    const blockers: Box[] = [];
    for (const z of drawn) {
      if (newCodes.has(z.code)) continue;
      const bb = z.bbox as number[] | null; // [minLng, minLat, maxLng, maxLat]
      if (!bb || bb.length < 4) continue;
      blockers.push({ minLng: bb[0], minLat: bb[1], maxLng: bb[2], maxLat: bb[3] });
    }
    console.log(`fitting ${NEW_ZONES.length} districts around ${blockers.length} drawn zone(s)`);

    const fitted: Array<{ def: ZoneDef; box: Box }> = [];
    const dropped: string[] = [];
    for (const def of NEW_ZONES) {
      const intended = boxOf(def);
      const box = clipBox(intended, blockers);
      const kept = area(intended) > 0 ? area(box) / area(intended) : 0;
      if (area(box) < MIN_AREA || kept < MIN_RETAINED) {
        dropped.push(`${def.code} (${Math.round(kept * 100)}%)`);
        continue;
      }
      fitted.push({ def, box });
      blockers.push(box); // later districts yield to this one
    }
    if (dropped.length > 0) {
      console.warn(
        `  already covered by a neighbour, left undrawn: ${dropped.join(", ")}`,
      );
    }

    // Belt and braces: prove the result before writing any of it.
    for (let i = 0; i < fitted.length; i++) {
      for (let j = i + 1; j < fitted.length; j++) {
        if (overlaps(fitted[i].box, fitted[j].box)) {
          throw new Error(`clip failed: ${fitted[i].def.code} still overlaps ${fitted[j].def.code}`);
        }
      }
    }

    if (dryRun) {
      fitted.forEach(({ def, box }) => {
        const c = centreOf(box);
        console.log(
          `  ${def.code.padEnd(14)} ${c.lat.toFixed(4)},${c.lng.toFixed(4)}  ` +
            `lng ${box.minLng.toFixed(3)}–${box.maxLng.toFixed(3)}  lat ${box.minLat.toFixed(3)}–${box.maxLat.toFixed(3)}`,
        );
      });
      continue;
    }

    let created = 0;
    let updated = 0;
    for (const { def, box } of fitted) {
      const polygon = boxToPolygon(box);
      const bbox = bboxOfPolygon(polygon);
      const centre = centreOf(box);
      const existing = await prisma.deliveryZone.findUnique({
        where: { tenantId_code: { tenantId: tid, code: def.code } },
        select: { id: true },
      });
      await prisma.deliveryZone.upsert({
        where: { tenantId_code: { tenantId: tid, code: def.code } },
        update: {
          name: def.name,
          nameAr: def.nameAr,
          polygon: polygon as any,
          bbox: bbox as any,
          centroidLat: centre.lat,
          centroidLng: centre.lng,
          isActive: true,
        },
        create: {
          tenantId: tid,
          code: def.code,
          name: def.name,
          nameAr: def.nameAr,
          polygon: polygon as any,
          bbox: bbox as any,
          centroidLat: centre.lat,
          centroidLng: centre.lng,
        },
      });
      existing ? updated++ : created++;
    }
    console.log(`zones: ${created} created, ${updated} refreshed`);

    // ── Surcharge grid over EVERY active zone, old and new ─────────────────
    // A new zone with no surcharge row is unserviceable for plan-less vendors,
    // which would just trade one refusal reason for another.
    const zones = await prisma.deliveryZone.findMany({
      where: { tenantId: tid, isActive: true },
      select: { id: true, code: true, centroidLat: true, centroidLng: true },
    });
    const placed = zones.filter((z) => z.centroidLat != null && z.centroidLng != null);
    if (placed.length < zones.length) {
      console.warn(`  ${zones.length - placed.length} zone(s) have no centroid and were skipped in the grid`);
    }

    let wrote = 0;
    let kept = 0;
    for (const origin of placed) {
      for (const dest of placed) {
        if (origin.id === dest.id) continue; // intra-zone is the flat fee
        const existing = await prisma.zoneSurcharge.findUnique({
          where: {
            tenantId_originZoneId_destZoneId: {
              tenantId: tid,
              originZoneId: origin.id,
              destZoneId: dest.id,
            },
          },
          select: { id: true },
        });
        // Never overwrite a price a human set. Only fill the holes.
        if (existing) {
          kept++;
          continue;
        }
        const dist = haversineMeters(
          Number(origin.centroidLat),
          Number(origin.centroidLng),
          Number(dest.centroidLat),
          Number(dest.centroidLng),
        );
        await prisma.zoneSurcharge.create({
          data: {
            tenantId: tid,
            originZoneId: origin.id,
            destZoneId: dest.id,
            surchargeKwd: surchargeFor(dist),
          },
        });
        wrote++;
      }
    }
    console.log(`surcharges: ${wrote} filled, ${kept} left as they were`);

    // ── Report plans that still cannot price the new pairs ────────────────
    const plans = await prisma.deliveryPlan.findMany({
      where: { tenantId: tid, type: "ZONE", isActive: true },
      select: {
        name: true,
        _count: { select: { zoneRates: true, vendors: true, branches: true } },
      },
    });
    const expected = placed.length * (placed.length - 1);
    for (const plan of plans) {
      const missing = expected - plan._count.zoneRates;
      if (missing > 0) {
        const users = plan._count.vendors + plan._count.branches;
        console.warn(
          `  PLAN "${plan.name}": ${missing} unpriced pairs` +
            (users > 0 ? ` — ${users} merchant(s) ride on it, their orders will be refused` : " (nobody assigned)"),
        );
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
