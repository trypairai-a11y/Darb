/**
 * Seeds the PRODUCTION Darb 2.0 tenant through the app's own HTTP APIs
 * (demo-admin auth). No direct DB access. Idempotent: tolerates
 * already-exists responses and re-PUTs settings/surcharges as full state.
 *
 * Run: node scripts/seed-prod-via-api.mjs [baseUrl]
 */
const BASE = process.argv[2] || "https://pair-darb-api.vercel.app";

const ZONES = [
  { code: "KWC", name: "Kuwait City", nameAr: "مدينة الكويت", ring: [[47.955, 29.36], [47.995, 29.36], [47.995, 29.392], [47.975, 29.4], [47.955, 29.385]] },
  { code: "SHARQ", name: "Sharq", nameAr: "شرق", ring: [[47.995, 29.365], [48.025, 29.365], [48.03, 29.388], [48.01, 29.398], [47.995, 29.392]] },
  { code: "SALMIYA", name: "Salmiya", nameAr: "السالمية", ring: [[48.05, 29.318], [48.095, 29.318], [48.1, 29.345], [48.075, 29.355], [48.05, 29.345]] },
  { code: "HAWALLY", name: "Hawally", nameAr: "حولي", ring: [[48.008, 29.32], [48.045, 29.32], [48.045, 29.35], [48.025, 29.358], [48.008, 29.348]] },
  { code: "JABRIYA", name: "Jabriya", nameAr: "الجابرية", ring: [[48.01, 29.298], [48.048, 29.298], [48.048, 29.317], [48.028, 29.324], [48.01, 29.317]] },
  { code: "FARWANIYA", name: "Farwaniya", nameAr: "الفروانية", ring: [[47.935, 29.255], [47.985, 29.255], [47.99, 29.29], [47.96, 29.3], [47.935, 29.288]] },
  { code: "SALWA", name: "Salwa", nameAr: "سلوى", ring: [[48.055, 29.286], [48.095, 29.286], [48.1, 29.312], [48.075, 29.32], [48.055, 29.31]] },
  { code: "MISHREF", name: "Mishref", nameAr: "مشرف", ring: [[48.045, 29.262], [48.085, 29.262], [48.088, 29.28], [48.065, 29.284], [48.045, 29.278]] },
];

const centroid = (ring) => {
  const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lat, lng };
};
const haversineKm = (a, b) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const surchargeFor = (km) => (km < 5 ? "0.250" : km < 10 ? "0.500" : "0.750");

let token = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const main = async () => {
  const login = await api("POST", "/api/auth/demo", {});
  token = login.data?.accessToken;
  if (!token) throw new Error(`demo login failed: ${login.status}`);
  console.log("auth: ok");

  const settings = await api("PUT", "/api/zones/settings", {
    intraZoneFeeKwd: "1.250", driverCashCeilingKwd: "100.000",
    offerWindowSec: 15, maxOfferRounds: 8, searchRadiusKm: 8, gpsStaleAfterSec: 180,
  });
  console.log(`settings: ${settings.status}`);

  const existing = await api("GET", "/api/zones?limit=100");
  const rows = existing.data?.data ?? existing.data ?? [];
  const byCode = new Map(rows.map((z) => [z.code, z]));
  for (const z of ZONES) {
    if (byCode.has(z.code)) { console.log(`zone ${z.code}: exists`); continue; }
    const closed = [...z.ring, z.ring[0]];
    const res = await api("POST", "/api/zones", {
      code: z.code, name: z.name, nameAr: z.nameAr,
      polygon: { type: "Polygon", coordinates: [closed] },
    });
    console.log(`zone ${z.code}: ${res.status}`);
    if (res.status === 201 || res.status === 200) byCode.set(z.code, res.data);
  }

  const fresh = await api("GET", "/api/zones?limit=100");
  const zoneRows = fresh.data?.data ?? fresh.data ?? [];
  const idByCode = new Map(zoneRows.map((z) => [z.code, z.id]));
  const cByCode = new Map(ZONES.map((z) => [z.code, centroid(z.ring)]));
  const matrix = [];
  for (const o of ZONES) for (const d of ZONES) {
    if (o.code === d.code) continue;
    matrix.push({
      originZoneId: idByCode.get(o.code), destZoneId: idByCode.get(d.code),
      surchargeKwd: surchargeFor(haversineKm(cByCode.get(o.code), cByCode.get(d.code))),
    });
  }
  const sur = await api("PUT", "/api/zones/surcharges", matrix);
  console.log(`surcharges (${matrix.length}): ${sur.status}`);

  const vendors = await api("GET", "/api/vendors?limit=100");
  const vRows = vendors.data?.data ?? vendors.data ?? [];
  let vendor = vRows.find((v) => v.code === "BRGB");
  if (!vendor) {
    const res = await api("POST", "/api/vendors", { name: "Burger Boulevard", nameAr: "برجر بوليفارد", code: "BRGB", phone: "+96550001111" });
    vendor = res.data;
    console.log(`vendor BRGB: ${res.status}`);
  } else console.log("vendor BRGB: exists");

  const detail = await api("GET", `/api/vendors/${vendor.id}`);
  const branches = detail.data?.branches ?? [];
  const wanted = [
    { name: "Salmiya Branch", nameAr: "فرع السالمية", address: "Salem Al Mubarak St, Salmiya", lat: 29.333, lng: 48.076 },
    { name: "Hawally Branch", nameAr: "فرع حولي", address: "Tunis St, Hawally", lat: 29.338, lng: 48.028 },
  ];
  for (const b of wanted) {
    if (branches.some((x) => x.name === b.name)) { console.log(`branch ${b.name}: exists`); continue; }
    const res = await api("POST", `/api/vendors/${vendor.id}/branches`, b);
    console.log(`branch ${b.name}: ${res.status} zone=${res.data?.zoneId ? "resolved" : "NULL"}`);
  }

  const det2 = await api("GET", `/api/vendors/${vendor.id}`);
  const salmiya = (det2.data?.branches ?? []).find((b) => b.name === "Salmiya Branch");
  const quote = await api("POST", "/api/zones/quote", { branchId: salmiya?.id, dropoff: { lat: 29.335, lng: 48.03 } });
  console.log(`quote Salmiya→Hawally: ${quote.status} ${JSON.stringify(quote.data)}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
