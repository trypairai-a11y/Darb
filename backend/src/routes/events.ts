import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "../middleware/auth";
import { subscribe, DarbEvent } from "../services/eventBus";
import { prisma } from "../config";

const router = Router();

/**
 * SSE auth middleware — accepts token from Authorization header OR ?token
 * query parameter. EventSource API doesn't support custom headers, so the
 * query param path is the primary flow for browser clients.
 */
function sseAuth(req: Request, res: Response, next: NextFunction): void {
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) { res.status(401).json({ error: "No token" }); return; }
  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (!req.user.tenantId) { res.status(401).json({ error: "Tenant context required" }); return; }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

router.use(sseAuth);

/** What a non-staff connection is allowed to see, resolved once at connect. */
export interface EventScope {
  /** The FLEET connection's own drivers. Empty set means it sees no driver. */
  driverIds?: Set<string>;
}

/** Staff roles get the tenant firehose. Everything else is scoped or refused. */
const STAFF_ROLES = new Set([
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
]);

/**
 * Who may see which event.
 *
 * VENDOR was scoped to its own `order.*` from the start (plan §A7). Every other
 * non-staff role fell through `role !== "VENDOR" → true` and received the whole
 * tenant firehose, which for a FLEET login meant every merchant's orders and
 * fees, `sos.raised`, `remittance.recorded`, `wallet.reconciliation_failed` —
 * and `driver.location` for RIVAL delivery companies' drivers. Darb's fleet
 * partners are subcontractors who compete with each other; that stream was a
 * live feed of one another's operations.
 *
 * So this fails closed now: a role is either staff, or it is on this list with
 * an explicit reason, or it sees nothing.
 */
export function eventVisibleTo(
  user: Pick<JwtPayload, "role" | "vendorId">,
  event: DarbEvent,
  scope?: EventScope,
): boolean {
  if (STAFF_ROLES.has(user.role)) return true; // staff: tenant firehose, unchanged

  if (user.role === "VENDOR") {
    if (!user.vendorId) return false; // malformed vendor token — fail closed
    if (!event.type.startsWith("order.")) return false;
    const payloadVendorId = (event.payload as { vendorId?: unknown } | undefined)?.vendorId;
    return payloadVendorId === user.vendorId;
  }

  if (user.role === "FLEET") {
    // Only what one of this company's OWN drivers is doing. Not the merchant
    // behind the order, not money, not another fleet's driver.
    const driverIds = scope?.driverIds;
    if (!driverIds || driverIds.size === 0) return false;
    const isDriverShaped =
      event.type.startsWith("driver.") ||
      event.type.startsWith("offer.") ||
      event.type.startsWith("order.");
    if (!isDriverShaped) return false;
    const payloadDriverId = (event.payload as { driverId?: unknown } | undefined)?.driverId;
    return typeof payloadDriverId === "string" && driverIds.has(payloadDriverId);
  }

  if (user.role === "CASH_COLLECTOR") {
    // The cash desk's own subject, and nothing else on the platform.
    return event.type === "remittance.recorded";
  }

  return false;
}

/**
 * GET /api/events — Server-Sent Events stream.
 *
 * The client connects with a Bearer token (query param or header) and
 * receives real-time events scoped to their tenant. Connection stays open
 * until the client disconnects or the server restarts.
 *
 * On Vercel serverless this route will be killed after the function timeout,
 * so the frontend should reconnect automatically (EventSource does this
 * natively). For long-lived deployments (Docker, PM2) the connection
 * persists indefinitely.
 *
 * Event format (text/event-stream):
 *   event: alert
 *   data: {"type":"alert","tenantId":"...","payload":{...},"timestamp":"..."}
 */
router.get("/", async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const user = req.user!;

  /**
   * A FLEET connection needs to know which drivers are its own, and that is a
   * database question. Resolved once here rather than per event: the filter
   * runs on every publish and must stay synchronous.
   *
   * The set is a snapshot for the life of the connection. A driver approved
   * mid-stream appears on the next reconnect, which EventSource does by itself
   * and Vercel forces anyway when the function times out.
   */
  let scope: EventScope | undefined;
  if (user.role === "FLEET") {
    const fleetPartnerId = (user as { fleetPartnerId?: string }).fleetPartnerId;
    const ownerGroupId = (user as { ownerGroupId?: string }).ownerGroupId;
    const drivers = fleetPartnerId || ownerGroupId
      ? await prisma.driver.findMany({
          where: {
            tenantId,
            ...(ownerGroupId
              ? { fleetPartner: { ownerGroupId } }
              : { fleetPartnerId: fleetPartnerId! }),
          },
          select: { id: true },
        })
      : [];
    scope = { driverIds: new Set(drivers.map((d) => d.id)) };
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering
  });

  // Heartbeat every 30s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30_000);

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ tenantId, timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to tenant events. Staff get the firehose; every other role is
  // filtered, and a role this function does not know sees nothing.
  const unsubscribe = subscribe(tenantId, (event: DarbEvent) => {
    if (!eventVisibleTo(user, event, scope)) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
