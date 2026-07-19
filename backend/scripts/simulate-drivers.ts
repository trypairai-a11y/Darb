/**
 * Darb 2.0 — live courier GPS simulator (demo helper).
 *
 * Moves the 5 seeded couriers along small random walks by POSTing batches to
 * the REAL `POST /api/agent/location` ingest every few seconds — exercising
 * device auth, session GPS updates, presence freshness, `driver.location`
 * SSE, and the /api/dispatch/positions snapshot exactly like real phones.
 *
 * Prereqs: seeded DB (seed.ts + seed-darb2.ts), backend server running.
 *
 * Run:  npx tsx scripts/simulate-drivers.ts
 * Env:  SIM_MINUTES   how long to run (default 1)
 *       SIM_INTERVAL  seconds between batches (default 4; keep ≥2 — the
 *                     agent location limiter allows 200 req / 5 min / device)
 *       E2E_BASE_URL  backend base (default http://localhost:3001)
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { PrismaClient } from "../src/generated/prisma";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const MINUTES = Number(process.env.SIM_MINUTES || 1);
const INTERVAL_S = Math.max(2, Number(process.env.SIM_INTERVAL || 4));

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SimCourier {
  driverId: string;
  name: string;
  deviceId: string;
  lat: number;
  lng: number;
}

/** ~±60m random step, gently biased to stay near the start point. */
function step(value: number, anchor: number): number {
  const drift = (Math.random() - 0.5) * 0.0012;
  const pull = (anchor - value) * 0.05;
  return +(value + drift + pull).toFixed(7);
}

async function main() {
  console.log(`simulate-drivers — ${BASE}, ${MINUTES} min, every ${INTERVAL_S}s`);

  const tenant = await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } });
  if (!tenant) throw new Error("Seeded tenant not found — run prisma seeds first.");
  const tenantId = tenant.id;

  // The 5 seeded couriers = the drivers holding DRIVER_CASH wallet accounts.
  const wallets = await prisma.walletAccount.findMany({
    where: { tenantId, ownerType: "DRIVER_CASH" },
    select: { ownerKey: true },
  });
  const driverIds = wallets.map((w) => w.ownerKey.replace(/^DRIVER:/, "")).slice(0, 5);
  if (driverIds.length === 0) throw new Error("No seeded couriers — run prisma/seed-darb2.ts.");

  const fallbackStarts: Array<[number, number]> = [
    [29.336, 48.071], [29.336, 48.028], [29.310, 48.030], [29.377, 47.982], [29.276, 47.963],
  ];

  const couriers: SimCourier[] = [];
  const now = new Date();
  for (let i = 0; i < driverIds.length; i++) {
    const driverId = driverIds[i];
    const driver = await prisma.driver.findFirst({ where: { id: driverId, tenantId } });
    if (!driver) continue;

    // Device row = agent token (device.id), minted the register-route way.
    const imei = `agent-${driverId}`;
    const existing =
      (await prisma.device.findUnique({ where: { driverId } })) ??
      (await prisma.device.findUnique({ where: { imei } }));
    const device = existing
      ? await prisma.device.update({
          where: { id: existing.id },
          data: { driverId, status: "ACTIVE", isOnline: true, lastSeen: now },
        })
      : await prisma.device.create({
          data: {
            imei, model: "Sim Agent", osVersion: "sim",
            driverId, tenantId, status: "ACTIVE", isOnline: true, lastSeen: now,
          },
        });

    // Start from the session's last GPS when present; else a zone anchor.
    const session = await prisma.courierOnlineSession.findFirst({
      where: { tenantId, driverId, endTime: null },
      orderBy: { startTime: "desc" },
    });
    const [fLat, fLng] = fallbackStarts[i % fallbackStarts.length];
    const lat = session?.lastGpsLat != null ? Number(session.lastGpsLat) : fLat;
    const lng = session?.lastGpsLng != null ? Number(session.lastGpsLng) : fLng;

    // Make sure the courier is ONLINE so positions/dispatch can see it.
    if (session) {
      await prisma.courierOnlineSession.update({
        where: { id: session.id },
        data: { isOnline: true, availability: session.availability === "BUSY" ? "BUSY" : "ONLINE", lastGpsAt: now },
      });
    } else {
      await prisma.courierOnlineSession.create({
        data: {
          tenantId, driverId, startTime: now, isOnline: true,
          availability: "ONLINE", lastGpsAt: now, lastGpsLat: lat, lastGpsLng: lng,
        },
      });
    }

    couriers.push({ driverId, name: driver.name, deviceId: device.id, lat, lng });
  }
  console.log(`couriers: ${couriers.map((c) => c.name).join(", ")}`);

  const anchors = new Map(couriers.map((c) => [c.driverId, { lat: c.lat, lng: c.lng }]));
  const endAt = Date.now() + MINUTES * 60 * 1000;
  let tick = 0;
  let sent = 0;
  let failed = 0;

  while (Date.now() < endAt) {
    tick++;
    for (const c of couriers) {
      const anchor = anchors.get(c.driverId)!;
      c.lat = step(c.lat, anchor.lat);
      c.lng = step(c.lng, anchor.lng);
      try {
        const res = await fetch(`${BASE}/api/agent/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: c.deviceId,
            driverId: c.driverId,
            locations: [
              {
                latitude: c.lat,
                longitude: c.lng,
                accuracy: 8 + Math.random() * 10,
                speed: 4 + Math.random() * 8,
                capturedAt: new Date().toISOString(),
                idempotencyKey: randomUUID(),
              },
            ],
          }),
        });
        if (res.ok) sent++;
        else {
          failed++;
          console.warn(`  ${c.name}: HTTP ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`);
        }
      } catch (err) {
        failed++;
        console.warn(`  ${c.name}: ${(err as Error).message}`);
      }
    }
    console.log(`tick ${tick}: ${couriers.map((c) => `${c.name.split(" ")[0]}@(${c.lat.toFixed(4)},${c.lng.toFixed(4)})`).join("  ")}`);
    if (Date.now() < endAt) await sleep(INTERVAL_S * 1000);
  }

  console.log(`\ndone — ${sent} batches accepted, ${failed} failed over ${tick} ticks.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`simulate-drivers failed: ${err.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
