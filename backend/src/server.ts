import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import rateLimit, { Store } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { initSentry } from "./config/sentry";
import { errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { swaggerSpec } from "./config/swagger";
import redis from "./config/redis";

initSentry();

import authRoutes from "./routes/auth";
import driverRoutes from "./routes/drivers";
import companyRoutes from "./routes/companies";
import vehicleRoutes from "./routes/vehicles";
import shiftRoutes from "./routes/shifts";
import orderRoutes from "./routes/orders";
import cashRoutes from "./routes/cash";
import deviceRoutes from "./routes/devices";
import simRoutes from "./routes/sims";
import alertRoutes from "./routes/alerts";
import ticketRoutes from "./routes/tickets";
import attendanceRoutes from "./routes/attendance";
import leaveRequestRoutes from "./routes/leaveRequests";
import agentRoutes from "./routes/agent";
import aiRoutes from "./routes/ai";
import analyticsRoutes from "./routes/analytics";
import userRoutes from "./routes/users";
import kpiRoutes from "./routes/kpis";
import platformSettingsRoutes from "./routes/platformSettings";
import platformOverviewRoutes from "./routes/platformOverview";
import notificationRoutes from "./routes/notifications";
import driverRestrictionRoutes from "./routes/driverRestrictions";
import insightsRoutes from "./routes/insights";
import dashboardRoutes from "./routes/dashboard";
import eventRoutes from "./routes/events";
import violationRoutes from "./routes/violations";
import penaltyRoutes from "./routes/penalties";
import orderFlowRoutes from "./routes/orderFlow";
import aiInsightsRoutes from "./routes/aiInsights";
import incentivesRoutes from "./routes/incentives";
import financialRoutes from "./routes/financial";
import queueRoutes from "./routes/queue";
import v2Routes from "./routes/v2";
import aiCosRoutes from "./routes/aiChiefOfStaff";
import decisionsRouter from "./routes/decisions";
import auditRouter from "./routes/audit";
import adminRouter from "./routes/admin";
import chatRouter from "./routes/chat";
import pinnedViewsRouter from "./routes/pinnedViews";
import scheduledBriefingsRouter from "./routes/scheduledBriefings";
// Darb 2.0 — delivery fulfillment (plan §A8/§A10)
import webhooksRouter from "./routes/webhooks";
import foodicsRouter, { foodicsCallbackRouter } from "./routes/foodics";
import zonesRouter from "./routes/zones";
import deliveryPlansRouter from "./routes/deliveryPlans";
import vendorsRouter from "./routes/vendors";
import vendorPortalRouter from "./routes/vendorPortal";
import deliveryOrdersRouter from "./routes/deliveryOrders";
import { opportunisticSweepMiddleware } from "./services/opportunisticSweep";
import walletsRouter from "./routes/wallets";
import incidentsRouter from "./routes/incidents";
import dispatchMonitorRouter from "./routes/dispatchMonitor";
import cronRouter from "./routes/cron";
import partnerRouter from "./routes/partner";
import trackRouter from "./routes/track";
import payRouter from "./routes/pay";
import agentDeliveryRouter from "./routes/agentDelivery";
import fleetsRouter from "./routes/fleets";
import fleetPortalRouter from "./routes/fleetPortal";
import cockpitRouter from "./routes/cockpit";
import { blockVendorOutsideAllowlist } from "./middleware/vendorContainment";
import { blockFleetOutsideAllowlist } from "./middleware/fleetContainment";
import { blockCashCollectorOutsideAllowlist } from "./middleware/cashDeskContainment";
import { startDispatchWorker } from "./queues/dispatchWorker";
import { startFoodicsWorker } from "./queues/foodicsWorker";
import { startWalletReconciliationWorker } from "./queues/walletReconciliationWorker";
import { startScheduledBriefingsWorker } from "./queues/scheduledBriefingsWorker";
import { startAnomalyScheduler } from "./services/anomalyScheduler";
import { startGpsMonitorScheduler, startPresenceSweeper } from "./services/gpsMonitorService";
import { startPerformanceTierScheduler } from "./queues/performanceTierWorker";
import { startInsightsScheduler } from "./services/insightsScheduler";
import { startShiftComplianceScheduler } from "./queues/shiftComplianceWorker";
import "./agent"; // registers agents as a side-effect
import { startAgentScheduler } from "./agent/scheduler";

const app = express();
// The API sits behind Next.js middleware locally and Vercel proxies in deploys.
// Trust the first proxy so rate limiting reads X-Forwarded-For correctly.
app.set("trust proxy", 1);

function redactUrlCredentials(rawUrl?: string) {
  if (!rawUrl) return rawUrl;
  const [pathname, query] = rawUrl.split("?", 2);
  if (!query) return rawUrl;

  const params = new URLSearchParams(query);
  for (const key of ["token", "accessToken", "refreshToken"]) {
    if (params.has(key)) params.set(key, "[Redacted]");
  }
  return `${pathname}?${params.toString()}`;
}

const staticAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3003",
  "http://localhost:3006",
  "http://localhost:4555",
  "http://localhost:4556",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// Allow Vercel preview/production deployments under our team scope only,
// plus a curated list of stable aliases. We deliberately do NOT accept any
// *.vercel.app — combined with credentials:true that would let any third-party
// Vercel deployment hit the API on behalf of a logged-in user.
const vercelOriginPattern = /^https:\/\/[a-z0-9-]+-trypairai-6527s-projects\.vercel\.app$/i;
const vercelAliasAllowlist = new Set<string>([
  "https://frontend-ebon-nine-34.vercel.app",
  "https://pair-darb.vercel.app",
  "https://darbkw.vercel.app",
  // Persona handles (one frontend app behind them all) + the driver web app.
  "https://darb-hq.vercel.app",
  "https://darb-merchant.vercel.app",
  "https://darb-fleet.vercel.app",
  "https://darb-track.vercel.app",
  "https://darb-driver.vercel.app",
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (staticAllowedOrigins.includes(origin)) return callback(null, true);
    if (vercelOriginPattern.test(origin)) return callback(null, true);
    if (vercelAliasAllowlist.has(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: (req as any).id }),
    serializers: {
      req: (req) => ({ method: req.method, url: redactUrlCredentials(req.url), id: req.id }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    // Quiet health checks — they're polled every few seconds
    autoLogging: { ignore: (req) => req.url === "/api/health" || req.url === "/" },
  })
);
app.use(express.json({
  limit: "10mb",
  // Darb 2.0 — capture the raw request body for webhook HMAC verification
  // (routes/webhooks.ts checks X-Foodics-Signature against req.rawBody when
  // FOODICS_WEBHOOK_HMAC_SECRET is set).
  verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Rate limiting — backed by Redis when REDIS_URL is configured (durable across
// Vercel cold starts and multi-instance deploys). Falls back to in-memory when
// Redis is unavailable.
function makeStore(prefix: string): Store | undefined {
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => (redis as any).call(...args),
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 20 : 500,
  message: { error: "Too many auth attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/me",
  store: makeStore("auth"),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health",
  store: makeStore("api"),
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Darb 2.0 — vendor containment (plan §A8): VENDOR-role tokens may only reach
// /api/auth, /api/vendor, /api/foodics and /api/events. One app-wide gate,
// mounted before every API router, protects the ~60 legacy staff routers
// without editing them. Non-vendor traffic passes through untouched.
app.use(blockVendorOutsideAllowlist);
app.use(blockFleetOutsideAllowlist);
// Revision 4 (#3) — the cash desk is its own portal: a CASH_COLLECTOR token
// reaches the hand-in surface and nothing else.
app.use(blockCashCollectorOutsideAllowlist);

// Darb 2.0 — PUBLIC routers (no auth) mounted BEFORE the auth-carrying ones.
// webhooksRouter: third-party platform callbacks (per-connection path secret).
// foodicsCallbackRouter: OAuth redirect from the Foodics console — defines
// ONLY GET /callback, so sharing the /api/foodics prefix with the authed
// foodicsRouter below is collision-free.
app.use("/api/webhooks", webhooksRouter);
app.use("/api/foodics", foodicsCallbackRouter);
// cronRouter: Vercel Cron tick that drives the sweeps the listen-block
// schedulers below would otherwise own. Bearer CRON_SECRET, cross-tenant by
// design, fails closed when the secret is unset. See routes/cron.ts.
app.use("/api/cron", cronRouter);
// partnerRouter: PRD §2 merchant order intake — API-key auth (partnerAuth),
// never JWT. trackRouter: PRD §12 public customer tracking — the 128-bit
// trackingToken is the only credential; strict safe-subset responses.
app.use("/api/partner", partnerRouter);
app.use("/api/track", trackRouter);
// payRouter: revision 10 (#2) public wallet top-up link. Same discipline as
// trackRouter — the 128-bit top-up token is the only credential, and the
// payload never carries anything about the shop beyond what is being paid.
app.use("/api/pay", payRouter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/sims", simRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leave-requests", leaveRequestRoutes);
app.use("/api/agent", agentRoutes);
// Darb 2.0 driver agent API (device-token auth) — same mount as agent.ts,
// AFTER it. Path sets are disjoint (verified): agent.ts owns /register,
// /heartbeat, /location, /orders (GET), /tickets, ...; agentDelivery owns
// /state, /availability, /offers/:id/*, /orders/:id/{status,pod,failed},
// /wallet, /incidents.
app.use("/api/agent", agentDeliveryRouter);
app.use("/api/ai", aiRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/kpi", kpiRoutes);
app.use("/api/platform-settings", platformSettingsRoutes);
app.use("/api/platform-overview", platformOverviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/driver-restrictions", driverRestrictionRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/violations", violationRoutes);
app.use("/api/penalties", penaltyRoutes);
app.use("/api/order-flow", orderFlowRoutes);
app.use("/api/ai-insights", aiInsightsRoutes);
app.use("/api/incentives", incentivesRoutes);
app.use("/api/financial", financialRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/v2", v2Routes);
app.use("/api/ai/cos", aiCosRoutes);
// Phase 2 Wave 2 — Decisions Surface (REQ-decisions-proposal-inbox,
// REQ-agent-propose-confirm) and audit log (CON-audit-row-shape reads).
app.use("/api/decisions", decisionsRouter);
app.use("/api/audit", auditRouter);
// Phase 2 Wave 4 — Founder/super-admin onboarding wizard + billing
// (REQ-pricing-model + REQ-gtm-onboarding). All routes super-admin gated;
// NOT tenantScope (admin operates across tenants by design).
app.use("/api/admin", adminRouter);
// Phase 4 Wave 2 — Chat surface.
//   /api/ai/chat/stream    — SSE chat agent stream
//   /api/chat/threads/*    — thread + message CRUD
// Both mounts share the same router; the route paths inside chatRouter
// are disjoint so this is a clean dual-mount.
app.use("/api/ai/chat", chatRouter);
app.use("/api/chat", chatRouter);
// Phase 4 Wave 4 — Pinned views CRUD + /:id/refresh.
app.use("/api/pinned-views", pinnedViewsRouter);
// Phase 4 Wave 5 — Scheduled briefings CRUD + BullMQ JobScheduler worker.
app.use("/api/scheduled-briefings", scheduledBriefingsRouter);
startScheduledBriefingsWorker();
// Darb 2.0 — delivery fulfillment surface (plan §A8):
//   /api/zones           zones CRUD + resolve/quote + surcharges + settings
//   /api/delivery-plans  named by-zone / by-km price lists (revision 4 #7)
//   /api/vendors         staff-facing vendor management
//   /api/vendor          vendor-portal (VENDOR role, vendorScope from JWT)
//   /api/delivery-orders staff order console (list/detail/timeline/assign/…)
//   /api/wallets         wallet accounts/entries/remittances/adjustments
//   /api/incidents       SOS + incident management
//   /api/dispatch        live positions snapshot + ops overview
//   /api/foodics         authed Foodics connect/status/branch-map/disconnect
//                        (public GET /callback mounted earlier, same prefix)
app.use("/api/zones", zonesRouter);
app.use("/api/delivery-plans", deliveryPlansRouter);
app.use("/api/vendors", vendorsRouter);
// Darb 2.0 PRD §9/§14 — fleet governance + founder cockpit
app.use("/api/fleets", fleetsRouter);
app.use("/api/fleet", fleetPortalRouter);
app.use("/api/cockpit", cockpitRouter);
app.use("/api/vendor", vendorPortalRouter);
// Traffic-driven dispatch sweep. Vercel Hobby will only schedule a cron
// once a day, so between 03:00 runs nothing expires offers or returns
// NO_DRIVER orders to dispatch. Mounted on the two surfaces the ops
// console actually polls, after auth, so a logged-in operator watching the
// board keeps the queue moving. Never blocks the response; off unless
// OPPORTUNISTIC_SWEEP=true. A real minute-level ticker still belongs on
// top of this — see .github/workflows/dispatch-ticker.yml.
app.use("/api/delivery-orders", opportunisticSweepMiddleware);
app.use("/api/dispatch", opportunisticSweepMiddleware);
app.use("/api/delivery-orders", deliveryOrdersRouter);
app.use("/api/wallets", walletsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/dispatch", dispatchMonitorRouter);
app.use("/api/foodics", foodicsRouter);

// API Documentation (Swagger UI — available at /api-docs)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Darb API Docs",
  swaggerOptions: { persistAuthorization: true },
}));
app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

// Root & health check
app.get("/", (_req, res) => {
  res.json({ name: "Darb API", status: "ok", timestamp: new Date().toISOString(), docs: "/api-docs" });
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

if (process.env.VERCEL !== "1") {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Darb backend running");
    startAnomalyScheduler();
    startGpsMonitorScheduler();
    startPerformanceTierScheduler();
    startInsightsScheduler();
    startShiftComplianceScheduler();
    // Darb 2.0 workers (plan §A10) — boot ONLY here (not module scope):
    // BullMQ when Redis is configured, in-process setTimeout fallback otherwise.
    startDispatchWorker();
    startFoodicsWorker();
    startWalletReconciliationWorker();
    // Presence sweeper — every minute, force availability OFFLINE for
    // sessions whose GPS is >5 min stale + publish driver.offline.
    startPresenceSweeper();
    // v2 agent runtime — no-op when ANTHROPIC_API_KEY is unset
    void startAgentScheduler();
  });
}

export default app;
