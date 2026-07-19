/**
 * Darb 2.0 — live end-to-end order exercise against a RUNNING backend.
 *
 * Proves the full delivery loop over HTTP: staff creates a COD order →
 * dispatch engine offers it to the one ONLINE courier → courier accepts,
 * walks the milestone stepper (with idempotent replay), delivers with the
 * POD PIN → wallet postings land (driver cash +total, vendor payable
 * +(total−fee), platform revenue +fee, balanced legs, idempotent replay) →
 * timeline is complete → the vendor portal user sees the DELIVERED order
 * and the wallet credit.
 *
 * Prereqs: local Postgres seeded with prisma/seed.ts + prisma/seed-darb2.ts,
 * backend dev server running (default http://localhost:3001).
 *
 * Run:  npx tsx scripts/e2e-order.ts
 * Env:  E2E_BASE_URL (default http://localhost:3001)
 *       E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (default seeded osama@fleet.kw / demo123)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "osama@fleet.kw";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

const prisma = new PrismaClient();

// ─── Tiny harness ───────────────────────────────────────────────────────────

let checks = 0;
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
  checks++;
  console.log(`  ✔ ${label}`);
}

function assertClose(actual: number, expected: number, label: string, eps = 0.0005) {
  assert(
    Math.abs(actual - expected) < eps,
    `${label} (expected ${expected.toFixed(3)}, got ${actual.toFixed(3)})`,
  );
}

const num = (v: unknown): number => Number(v ?? 0);

async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Darb 2.0 E2E — ${BASE}`);

  // 0. Sanity: server up
  const health = await http("GET", "/api/health");
  assert(health.status === 200, "server is up (/api/health)");

  // 1. Staff login
  const login = await http("POST", "/api/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(login.status === 200 && login.json?.accessToken, `staff login as ${ADMIN_EMAIL}`);
  const staff = login.json.accessToken as string;
  const tenantId = login.json.user?.tenantId as string;
  assert(tenantId, "staff token carries tenantId");

  // 2. Seeded fixtures (vendor BRGB, Salmiya branch, Hawally zone)
  const vendor = await prisma.vendor.findFirst({ where: { tenantId, code: "BRGB" } });
  assert(vendor, "seeded vendor BRGB exists");
  const branch = await prisma.vendorBranch.findFirst({
    where: { tenantId, vendorId: vendor.id, name: { contains: "Salmiya" } },
  });
  assert(branch?.lat != null && branch?.lng != null, "Salmiya branch with coordinates");
  const salmiya = await prisma.deliveryZone.findFirst({ where: { tenantId, code: "SALMIYA" } });
  const hawally = await prisma.deliveryZone.findFirst({ where: { tenantId, code: "HAWALLY" } });
  assert(salmiya && hawally, "SALMIYA + HAWALLY zones seeded");
  const surcharge = await prisma.zoneSurcharge.findFirst({
    where: { tenantId, originZoneId: salmiya.id, destZoneId: hawally.id },
  });
  assert(surcharge, "SALMIYA→HAWALLY surcharge row seeded");
  const settings = await prisma.fulfillmentSettings.findFirst({ where: { tenantId } });
  assert(settings, "FulfillmentSettings seeded");
  const expectedFee = num(settings.intraZoneFeeKwd) + num(surcharge.surchargeKwd);

  // 3. Pick one seeded courier; make it the ONLY dispatchable one.
  //    (Direct prisma prep is fine per the exercise brief — dispatch itself
  //    must run through the real engine.)
  const walletDrivers = await prisma.walletAccount.findMany({
    where: { tenantId, ownerType: "DRIVER_CASH" },
    select: { ownerKey: true },
  });
  const seededDriverIds = walletDrivers.map((w) => w.ownerKey.replace(/^DRIVER:/, ""));
  assert(seededDriverIds.length >= 5, `5 seeded couriers with cash wallets (got ${seededDriverIds.length})`);
  const courier = await prisma.driver.findFirst({
    where: { tenantId, id: { in: seededDriverIds }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  assert(courier, "picked a seeded ACTIVE courier");

  const now = new Date();
  const nearPickup = { lat: num(branch.lat) + 0.004, lng: num(branch.lng) - 0.004 };
  for (const driverId of seededDriverIds) {
    const isOurs = driverId === courier.id;
    const open = await prisma.courierOnlineSession.findFirst({
      where: { tenantId, driverId, endTime: null },
      orderBy: { startTime: "desc" },
    });
    const data = isOurs
      ? {
          availability: "ONLINE", isOnline: true, lastGpsAt: now,
          lastGpsLat: nearPickup.lat, lastGpsLng: nearPickup.lng,
        }
      : { availability: "OFFLINE", isOnline: false };
    if (open) {
      await prisma.courierOnlineSession.update({ where: { id: open.id }, data });
    } else if (isOurs) {
      await prisma.courierOnlineSession.create({
        data: { tenantId, driverId, startTime: now, ...data },
      });
    }
  }
  console.log(`  courier under test: ${courier.name} (${courier.id}) near Salmiya branch; others OFFLINE`);

  // Clear any leftover open offers/active orders from previous runs so the
  // engine's "no open offer / single order per trip" rules don't skip us.
  await prisma.dispatchOffer.updateMany({
    where: { tenantId, driverId: courier.id, status: "OFFERED" },
    data: { status: "CANCELLED", respondedAt: now },
  });
  const leftover = await prisma.deliveryOrder.updateMany({
    where: { tenantId, driverId: courier.id, status: { in: ["ASSIGNED", "PICKED_UP"] } },
    data: { status: "CANCELLED", cancelReason: "e2e-cleanup" },
  });
  if (leftover.count > 0) console.log(`  (cleaned ${leftover.count} leftover active order[s])`);

  // 4. Device + agent token, minted the way POST /api/agent/register does:
  //    the device row id IS the bearer token.
  const imei = `agent-${courier.id}`;
  const existingDevice =
    (await prisma.device.findUnique({ where: { driverId: courier.id } })) ??
    (await prisma.device.findUnique({ where: { imei } }));
  const device = existingDevice
    ? await prisma.device.update({
        where: { id: existingDevice.id },
        data: { driverId: courier.id, status: "ACTIVE", isOnline: true, lastSeen: now },
      })
    : await prisma.device.create({
        data: {
          imei, model: "E2E Agent", osVersion: "e2e",
          driverId: courier.id, tenantId,
          status: "ACTIVE", isOnline: true, lastSeen: now,
        },
      });
  const agentToken = device.id;
  const state0 = await http("GET", "/api/agent/state", { token: agentToken });
  assert(state0.status === 200 && state0.json?.driver?.id === courier.id, "agent /state resolves the device token");
  assert(state0.json.availability === "ONLINE", "courier availability is ONLINE");
  const walletBefore = state0.json.wallet;

  // Wallet baselines (staff view) BEFORE the order.
  const accountsBefore = await http("GET", "/api/wallets/accounts?limit=100", { token: staff });
  assert(accountsBefore.status === 200, "GET /api/wallets/accounts (baseline)");
  const balOf = (accounts: any[], ownerKey: string) =>
    num(accounts.find((a: any) => a.ownerKey === ownerKey)?.balanceKwd);
  const beforeDriver = balOf(accountsBefore.json.data, `DRIVER:${courier.id}`);
  const beforeVendor = balOf(accountsBefore.json.data, `VENDOR:${vendor.id}`);
  const beforeRevenue = balOf(accountsBefore.json.data, "PLATFORM_REVENUE");

  // 5. Create the COD order — Salmiya pickup, dropoff inside HAWALLY.
  const ORDER_TOTAL = 5.0;
  const dropoff = { lat: 29.339, lng: 48.027 }; // inside seeded HAWALLY polygon
  const created = await http("POST", "/api/delivery-orders", {
    token: staff,
    body: {
      vendorId: vendor.id,
      branchId: branch.id,
      paymentMethod: "COD",
      orderTotalKwd: ORDER_TOTAL.toFixed(3),
      customerName: "E2E Customer",
      customerPhone: "+96599001122",
      dropoffAddress: "Tunis St, Hawally (E2E)",
      dropoff,
    },
  });
  assert(created.status === 201, `POST /api/delivery-orders → 201 (got ${created.status}: ${JSON.stringify(created.json)})`);
  const orderId = created.json.id as string;
  assert(created.json.status === "DISPATCHING", `order status DISPATCHING (got ${created.json.status} / ${created.json.rejectionReason ?? "-"})`);
  assertClose(num(created.json.deliveryFeeKwd), expectedFee, `feeKwd = ${num(settings.intraZoneFeeKwd).toFixed(3)} + ${num(surcharge.surchargeKwd).toFixed(3)} Salmiya→Hawally surcharge`);
  console.log(`  order ${created.json.orderNumber} (${orderId}) total ${ORDER_TOTAL.toFixed(3)} fee ${num(created.json.deliveryFeeKwd).toFixed(3)}`);

  // 6. Poll agent /state until the dispatch offer lands (15s window).
  let offer: any = null;
  for (let i = 0; i < 30; i++) {
    const s = await http("GET", "/api/agent/state", { token: agentToken });
    if (s.json?.activeOffer?.orderId === orderId) { offer = s.json.activeOffer; break; }
    await sleep(500);
  }
  assert(offer, "dispatch worker produced an offer for our courier (via GET /api/agent/state)");
  assert(typeof offer.expiresAt === "string" && typeof offer.serverNow === "string", "offer carries expiresAt + serverNow");
  assertClose(num(offer.codAmountKwd), ORDER_TOTAL, "offer codAmountKwd = order total");

  // 7. Accept → ASSIGNED, positions shows the driver busy.
  const accepted = await http("POST", `/api/agent/offers/${offer.offerId}/accept`, { token: agentToken });
  assert(accepted.status === 200 && accepted.json?.order?.id === orderId, "accept offer → 200 {order}");
  const afterAccept = await http("GET", `/api/delivery-orders/${orderId}`, { token: staff });
  assert(afterAccept.json?.status === "ASSIGNED", "order is ASSIGNED after accept");
  assert(afterAccept.json?.driver?.id === courier.id, "order.driver is our courier");
  const positions = await http("GET", "/api/dispatch/positions", { token: staff });
  const pos = (positions.json as any[]).find((p) => p.driverId === courier.id);
  assert(pos?.hasActiveOrder === true && pos?.activeOrderId === orderId, "GET /api/dispatch/positions shows the driver busy on this order");
  assert(pos?.status === "BUSY", `courier availability flipped to BUSY (got ${pos?.status})`);

  // 8. Milestone stepper with idempotency keys; replay one.
  const milestones = [
    "HEADING_TO_PICKUP", "ARRIVED_AT_PICKUP", "PICKED_UP",
    "HEADING_TO_DROPOFF", "ARRIVED_AT_DROPOFF",
  ] as const;
  const keyFor = (m: string) => `e2e-${orderId}-${m}`;
  for (const m of milestones) {
    const r = await http("POST", `/api/agent/orders/${orderId}/status`, {
      token: agentToken,
      body: {
        status: m, idempotencyKey: keyFor(m),
        occurredAt: new Date().toISOString(),
        lat: dropoff.lat, lng: dropoff.lng,
      },
    });
    assert(r.status === 200, `milestone ${m} → 200`);
  }
  const replay = await http("POST", `/api/agent/orders/${orderId}/status`, {
    token: agentToken,
    body: { status: "HEADING_TO_DROPOFF", idempotencyKey: keyFor("HEADING_TO_DROPOFF") },
  });
  assert(replay.status === 200 && replay.json?.replay === true, "milestone replay (same idempotencyKey) → 200 {replay:true}");
  const dupEvents = await prisma.orderEvent.count({
    where: {
      tenantId, orderId,
      metadata: { path: ["idempotencyKey"], equals: keyFor("HEADING_TO_DROPOFF") },
    },
  });
  assert(dupEvents === 1, `replay did not duplicate the OrderEvent (count=${dupEvents})`);

  // 9. POD with the order's podPin + COD collection → DELIVERED + wallet.
  const detail = await http("GET", `/api/delivery-orders/${orderId}`, { token: staff });
  const podPin = detail.json?.podPin as string;
  assert(/^\d{4}$/.test(podPin ?? ""), "staff order detail exposes the 4-digit podPin");
  const podKey = `e2e-${orderId}-pod`;
  const pod = await http("POST", `/api/agent/orders/${orderId}/pod`, {
    token: agentToken,
    body: {
      method: "PIN", pin: podPin,
      codCollectedKwd: ORDER_TOTAL.toFixed(3),
      lat: dropoff.lat, lng: dropoff.lng,
      idempotencyKey: podKey,
    },
  });
  assert(pod.status === 200, `POD → 200 (got ${pod.status}: ${JSON.stringify(pod.json)})`);
  assert(pod.json?.order?.status === "DELIVERED", "POD response order.status DELIVERED");
  assertClose(
    num(pod.json?.wallet?.cashOnHandKwd),
    num(walletBefore.cashOnHandKwd) + ORDER_TOTAL,
    `POD wallet cashOnHand increased by ${ORDER_TOTAL.toFixed(3)}`,
  );

  // 10. Ledger assertions: balances, balanced legs, idempotent POD replay.
  const accountsAfter = await http("GET", "/api/wallets/accounts?limit=100", { token: staff });
  const afterDriver = balOf(accountsAfter.json.data, `DRIVER:${courier.id}`);
  const afterVendor = balOf(accountsAfter.json.data, `VENDOR:${vendor.id}`);
  const afterRevenue = balOf(accountsAfter.json.data, "PLATFORM_REVENUE");
  assertClose(afterDriver - beforeDriver, ORDER_TOTAL, "driver cash +orderTotal");
  assertClose(afterVendor - beforeVendor, ORDER_TOTAL - expectedFee, "vendor payable +(total − fee)");
  assertClose(afterRevenue - beforeRevenue, expectedFee, "platform revenue +fee");

  const tx = await prisma.walletTransaction.findFirst({
    where: { tenantId, idempotencyKey: `cod-settle:${orderId}` },
    include: { entries: true },
  });
  assert(tx, "WalletTransaction cod-settle:{orderId} exists");
  const debits = tx.entries.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + num(e.amountKwd), 0);
  const credits = tx.entries.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + num(e.amountKwd), 0);
  assert(tx.entries.length >= 3, `settlement has ${tx.entries.length} legs (≥3)`);
  assertClose(debits, credits, `transaction legs balanced (Σdebit ${debits.toFixed(3)} = Σcredit ${credits.toFixed(3)})`);

  const txCountBefore = await prisma.walletTransaction.count({ where: { tenantId, orderId } });
  const podReplay = await http("POST", `/api/agent/orders/${orderId}/pod`, {
    token: agentToken,
    body: { method: "PIN", pin: podPin, codCollectedKwd: ORDER_TOTAL.toFixed(3), idempotencyKey: podKey },
  });
  assert(podReplay.status === 200 && podReplay.json?.order?.status === "DELIVERED", "POD replay (same idempotencyKey) → 200 idempotent");
  const txCountAfter = await prisma.walletTransaction.count({ where: { tenantId, orderId } });
  assert(txCountAfter === txCountBefore, `POD replay created no new wallet transaction (${txCountAfter})`);

  // 11. Timeline completeness (OrderEvent chain). Offer history is NOT an
  //     OrderEvent by design — it lives on DispatchOffer rows, surfaced via
  //     the detail endpoint's `offers` array (offer.sent/accepted are SSE).
  const timeline = await http("GET", `/api/delivery-orders/${orderId}/timeline`, { token: staff });
  assert(timeline.status === 200 && Array.isArray(timeline.json), "GET /:id/timeline → event list");
  const actions = (timeline.json as any[]).map((e) => e.action);
  for (const expected of [
    "order.created", "order.dispatching", "order.assigned",
    "driver.heading_to_pickup", "driver.arrived_at_pickup", "order.picked_up",
    "driver.heading_to_dropoff", "driver.arrived_at_dropoff",
    "order.pod", "order.delivered",
  ]) {
    assert(actions.includes(expected), `timeline contains ${expected}`);
  }
  const detailAfter = await http("GET", `/api/delivery-orders/${orderId}`, { token: staff });
  const acceptedOffer = (detailAfter.json?.offers as any[]).find(
    (o) => o.status === "ACCEPTED" && o.driver?.id === courier.id,
  );
  assert(acceptedOffer, "order detail offers[] records the ACCEPTED offer for our courier");

  // 12. Vendor portal: create a VENDOR user, log in, see the DELIVERED order
  //     + the wallet credit.
  const vendorEmail = `e2e-vendor-${Date.now()}@brgb.kw`;
  const vendorUser = await http("POST", `/api/vendors/${vendor.id}/users`, {
    token: staff,
    body: { email: vendorEmail, password: "e2e-secret-123", name: "E2E Vendor User" },
  });
  assert(vendorUser.status === 201 && vendorUser.json?.role === "VENDOR", "POST /api/vendors/:id/users → 201 VENDOR user");
  const vendorLogin = await http("POST", "/api/auth/login", {
    body: { email: vendorEmail, password: "e2e-secret-123" },
  });
  assert(vendorLogin.status === 200 && vendorLogin.json?.accessToken, "vendor user can log in");
  const vtoken = vendorLogin.json.accessToken as string;

  const contained = await http("GET", "/api/drivers", { token: vtoken });
  assert(contained.status === 403, "vendor containment: /api/drivers → 403 for VENDOR token");

  const vOrder = await http("GET", `/api/vendor/orders/${orderId}`, { token: vtoken });
  assert(vOrder.status === 200 && vOrder.json?.status === "DELIVERED", "vendor portal sees the order DELIVERED");
  const vEntries = await http("GET", "/api/vendor/wallet/entries?limit=50", { token: vtoken });
  assert(vEntries.status === 200, "GET /api/vendor/wallet/entries → 200");
  const credit = (vEntries.json.data as any[]).find(
    (e) => e?.transaction?.orderId === orderId && e.direction === "CREDIT",
  );
  assert(credit, "vendor wallet entries include the credit for this order");
  assertClose(num(credit.amountKwd), ORDER_TOTAL - expectedFee, "vendor credit amount = total − fee");

  console.log(`\nE2E PASSED — ${checks} assertions.`);
  console.log(`  order ${created.json.orderNumber}: total ${ORDER_TOTAL.toFixed(3)} KWD, fee ${expectedFee.toFixed(3)} KWD`);
  console.log(`  driver cash ${beforeDriver.toFixed(3)} → ${afterDriver.toFixed(3)}`);
  console.log(`  vendor payable ${beforeVendor.toFixed(3)} → ${afterVendor.toFixed(3)}`);
  console.log(`  platform revenue ${beforeRevenue.toFixed(3)} → ${afterRevenue.toFixed(3)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nE2E FAILED: ${err.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
