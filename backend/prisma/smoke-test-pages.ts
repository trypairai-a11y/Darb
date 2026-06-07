/**
 * smoke-test-pages.ts — read-only API smoke test that verifies every page family
 * has data to render. Logs in as the demo admin, hits ~50 endpoints, and prints
 * a colour-coded delta list.
 *
 * Run with:
 *   cd backend && npx tsx prisma/smoke-test-pages.ts
 *
 * Exit code: 0 if no RED, 1 if any RED.
 */

const BASE = process.env.API_BASE || "http://localhost:3001";
const EMAIL = "osama@fleet.kw";
const PASSWORD = "demo123";

type Result = { url: string; status: number; len: number | null; sample: string; ok: boolean };

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonth(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { accessToken: string };
  return json.accessToken;
}

function classify(body: any): { len: number | null; ok: boolean; sample: string } {
  if (body == null) return { len: null, ok: false, sample: "null" };
  if (Array.isArray(body)) return { len: body.length, ok: body.length > 0, sample: `array(${body.length})` };
  if (typeof body === "object") {
    // common pagination/list shape
    if (Array.isArray(body.data)) return { len: body.data.length, ok: body.data.length > 0, sample: `data(${body.data.length})` };
    if (Array.isArray(body.couriers)) return { len: body.couriers.length, ok: body.couriers.length > 0, sample: `couriers(${body.couriers.length})` };
    if (Array.isArray(body.alerts)) return { len: body.alerts.length, ok: body.alerts.length > 0, sample: `alerts(${body.alerts.length})` };
    if (Array.isArray(body.drivers)) return { len: body.drivers.length, ok: body.drivers.length > 0, sample: `drivers(${body.drivers.length})` };
    if (Array.isArray(body.notifications)) return { len: body.notifications.length, ok: body.notifications.length > 0, sample: `notifications(${body.notifications.length})` };
    if (Array.isArray(body.stores)) return { len: body.stores.length, ok: body.stores.length > 0, sample: `stores(${body.stores.length})` };
    if (Array.isArray(body.zones)) return { len: body.zones.length, ok: body.zones.length > 0, sample: `zones(${body.zones.length})` };
    // it's a populated object — count meaningful keys
    const keys = Object.keys(body).filter((k) => body[k] != null && body[k] !== 0 && body[k] !== "");
    return { len: keys.length, ok: keys.length >= 1, sample: `obj(${keys.slice(0, 4).join(",")})` };
  }
  return { len: 1, ok: true, sample: String(body).slice(0, 30) };
}

async function hit(token: string, url: string): Promise<Result> {
  try {
    const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      let txt = "";
      try { txt = (await res.text()).slice(0, 80); } catch {}
      return { url, status: res.status, len: null, sample: txt, ok: false };
    }
    const body = await res.json();
    const c = classify(body);
    return { url, status: res.status, len: c.len, sample: c.sample, ok: c.ok };
  } catch (e: any) {
    return { url, status: 0, len: null, sample: e.message?.slice(0, 80) ?? "fetch error", ok: false };
  }
}

const today = startOfDay();
const weekStart = addDays(today, -6);
const thirtyDaysAgo = addDays(today, -30);
const todayStr = formatDate(today);
const weekStartStr = formatDate(weekStart);
const monthStr = formatMonth(today);
const thirtyDaysAgoStr = formatDate(thirtyDaysAgo);

const ENDPOINTS: string[] = [
  // Dashboard / overview
  "/api/dashboard/overview",
  "/api/dashboard/live-map",
  "/api/companies",
  "/api/users",

  // Drivers / vehicles
  "/api/drivers?limit=20",
  "/api/drivers/summary",
  "/api/vehicles",
  "/api/vehicles/summary",
  "/api/devices",
  "/api/devices/summary",

  // Operations
  "/api/orders?limit=20",
  "/api/orders/summary",
  `/api/orders/daily-by-platform?dateFrom=${weekStartStr}&dateTo=${todayStr}`,
  "/api/shifts?limit=20",
  `/api/shifts/booking-status?date=${todayStr}`,
  "/api/shifts/summary",
  "/api/attendance?limit=20",
  "/api/attendance/live",
  "/api/attendance/summary",
  "/api/cash?limit=20",
  "/api/cash/cod?limit=20",
  "/api/cash/transactions?limit=20",

  // Compliance
  "/api/violations?limit=20",
  "/api/violations/summary",
  "/api/penalties?limit=20",
  "/api/tickets",
  "/api/alerts",
  "/api/leave-requests?limit=20",
  "/api/driver-restrictions?limit=20",

  // Notifications + AI
  "/api/notifications?limit=20",
  "/api/notifications/counts",
  "/api/insights",
  "/api/ai-insights/contextual?context=dashboard",
  "/api/ai/scores",
  "/api/ai/digest",

  // KPIs
  "/api/kpi/records?limit=20",
  `/api/kpi/summary?dateFrom=${weekStartStr}&dateTo=${todayStr}`,
  "/api/kpi/definitions",

  // Keeta
  "/api/keeta/overview",
  "/api/keeta/metrics?limit=20",
  "/api/keeta/metrics/summary",
  "/api/keeta/drivers/summary",
  "/api/keeta/monitor/couriers",
  "/api/keeta/monitor/alerts",
  "/api/keeta/operation-centre/by-courier",
  "/api/keeta/operation-centre/by-order",
  "/api/keeta/courier-details",
  "/api/keeta/available-shifts",
  `/api/keeta/reports/task-volumes?from=${thirtyDaysAgoStr}&to=${todayStr}`,

  // Talabat
  "/api/talabat/overview",
  "/api/talabat/sessions?limit=20",
  `/api/talabat/sessions/summary?date=${todayStr}`,
  `/api/talabat/sessions/daily-overview?date=${todayStr}`,
  "/api/talabat/deliveries?limit=20",
  "/api/talabat/compliance?limit=20",
  "/api/talabat/compliance/summary",
  "/api/talabat/drivers/summary",
  "/api/talabat/orders/summary",
  "/api/talabat/available-shifts",

  // Deliveroo
  "/api/deliveroo/drivers/summary",
  "/api/deliveroo/orders/summary",
  "/api/deliveroo/orders?limit=20",
  "/api/deliveroo/cash?limit=20",
  "/api/deliveroo/shifts/summary",
  "/api/deliveroo/performance",
  "/api/deliveroo/metrics?limit=20",

  // Americana
  `/api/americana/overview?month=${monthStr}`,
  "/api/americana/drivers/summary",
  `/api/americana/performance?month=${monthStr}`,
  `/api/americana/branch-performance?month=${monthStr}&threshold=0.8`,
  "/api/americana/chains",
  "/api/americana/stores",
  "/api/americana/rates",
  `/api/americana/assignments?month=${monthStr}`,

  // Platform
  "/api/platform-overview/talabat/live",
  "/api/platform-settings/TALABAT",
  "/api/platform-settings/KEETA",
  "/api/platform-settings/DELIVEROO",
  "/api/platform-settings/AMERICANA",

  // Financial / incentives
  "/api/financial/billings?limit=20",
  "/api/financial/withdrawals?limit=20",
  "/api/financial/tax-invoices?limit=20",
  "/api/financial/summary",
  "/api/incentives/rounds",

  // V2 / queue
  "/api/v2/pulse",
  "/api/v2/briefing",
  "/api/queue?resolved=false",
  "/api/queue/counts",
  `/api/keeta/shift-monitor/rollup?date=${todayStr}`,
  "/api/keeta/shift-monitor/config",
  "/api/sims?limit=20",
];

async function main() {
  console.log(`${BOLD}Logging in to ${BASE}...${RESET}`);
  const token = await login();
  console.log(`Got token. Hitting ${ENDPOINTS.length} endpoints...\n`);

  const results: Result[] = [];
  // Run in parallel batches of 8
  for (let i = 0; i < ENDPOINTS.length; i += 8) {
    const batch = ENDPOINTS.slice(i, i + 8);
    const batchRes = await Promise.all(batch.map((u) => hit(token, u)));
    results.push(...batchRes);
  }

  const red = results.filter((r) => r.status === 0 || r.status >= 500 || (r.status === 200 && !r.ok));
  const yellow = results.filter((r) => r.status >= 400 && r.status < 500);
  const green = results.filter((r) => r.status === 200 && r.ok);

  for (const r of results) {
    let color = GREEN, tag = "GREEN";
    if (r.status === 0 || r.status >= 500 || (r.status === 200 && !r.ok)) { color = RED; tag = " RED "; }
    else if (r.status >= 400) { color = YELLOW; tag = "YELLW"; }
    const status = String(r.status).padEnd(3);
    const len = r.len === null ? "  -" : String(r.len).padStart(3);
    console.log(`${color}[${tag}]${RESET} ${status} ${len}  ${r.url.padEnd(70)} ${r.sample}`);
  }

  console.log(`\n${BOLD}Summary:${RESET} ${GREEN}${green.length} GREEN${RESET} · ${YELLOW}${yellow.length} YELLOW${RESET} · ${RED}${red.length} RED${RESET}`);

  if (red.length > 0) {
    console.log(`\n${RED}${BOLD}RED endpoints:${RESET}`);
    for (const r of red) console.log(`  ${r.url}  → ${r.status} ${r.sample}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
