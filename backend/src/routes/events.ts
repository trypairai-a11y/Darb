import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "../middleware/auth";
import { subscribe, DarbEvent } from "../services/eventBus";

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

/**
 * Darb 2.0 vendor SSE scoping (plan §A7). Staff connections receive the
 * tenant firehose (unchanged). VENDOR connections receive ONLY `order.*`
 * events whose payload.vendorId matches the vendorId baked into their JWT —
 * everything else (driver GPS, wallet, incidents, other vendors' orders) is
 * dropped server-side. Exported for the events tenant-isolation test.
 */
export function eventVisibleTo(
  user: Pick<JwtPayload, "role" | "vendorId">,
  event: DarbEvent
): boolean {
  if (user.role !== "VENDOR") return true; // staff: tenant firehose, unchanged
  if (!user.vendorId) return false; // malformed vendor token — fail closed
  if (!event.type.startsWith("order.")) return false;
  const payloadVendorId = (event.payload as { vendorId?: unknown } | undefined)?.vendorId;
  return payloadVendorId === user.vendorId;
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
router.get("/", (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;

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

  // Subscribe to tenant events (vendor connections get a filtered view)
  const user = req.user!;
  const unsubscribe = subscribe(tenantId, (event: DarbEvent) => {
    if (!eventVisibleTo(user, event)) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
