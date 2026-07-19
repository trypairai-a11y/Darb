// Darb 2.0 — vendor containment (plan §A8).
//
// Behavior contract for blockVendorOutsideAllowlist (global middleware,
// mounted by server.ts BEFORE the routers):
//   - staff tokens (any non-VENDOR role) → pass everywhere
//   - VENDOR tokens → pass only /api/auth, /api/vendor, /api/foodics,
//     /api/events (exact segment match — /api/vendors stays staff-only)
//   - no token / invalid token → pass (downstream authMiddleware owns 401s)
//   - a pre-populated req.user is trusted without re-verifying the token

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { blockVendorOutsideAllowlist } from "../../middleware/vendorContainment";

// Matches the JWT_SECRET served by the mocks/config env proxy that
// vendorContainment resolves through moduleNameMapper.
const SECRET = "test";

function sign(payload: Record<string, unknown>): string {
  return jwt.sign(payload, SECRET, { expiresIn: "5m" });
}

const vendorToken = sign({
  userId: "u-vendor", tenantId: "t-1", role: "VENDOR", email: "v@x.com", vendorId: "v-1",
});
const staffToken = sign({
  userId: "u-staff", tenantId: "t-1", role: "ADMIN", email: "a@x.com",
});

function makeApp(preUser?: Record<string, unknown>) {
  const app = express();
  if (preUser) {
    app.use((req: any, _res, next) => { req.user = preUser; next(); });
  }
  app.use(blockVendorOutsideAllowlist);
  const ok = (_req: express.Request, res: express.Response) => { res.json({ ok: true }); };
  app.get("/api/keeta/monitor", ok);
  app.get("/api/vendors", ok);
  app.get("/api/vendor/orders", ok);
  app.get("/api/vendor", ok);
  app.get("/api/auth/me", ok);
  app.get("/api/events", ok);
  return app;
}

describe("blockVendorOutsideAllowlist", () => {
  test("staff token passes staff routes", async () => {
    const res = await request(makeApp())
      .get("/api/keeta/monitor")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("VENDOR token on /api/keeta → 403", async () => {
    const res = await request(makeApp())
      .get("/api/keeta/monitor")
      .set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Vendor accounts cannot access this resource" });
  });

  test("VENDOR token allowed on /api/vendor/*, /api/auth/*, /api/events", async () => {
    for (const path of ["/api/vendor/orders", "/api/vendor", "/api/auth/me", "/api/events"]) {
      const res = await request(makeApp())
        .get(path)
        .set("Authorization", `Bearer ${vendorToken}`);
      expect(res.status).toBe(200);
    }
  });

  test("VENDOR token on staff-facing /api/vendors → 403 (prefix is segment-exact)", async () => {
    const res = await request(makeApp())
      .get("/api/vendors")
      .set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });

  test("VENDOR token via ?token= query (SSE style) is still contained", async () => {
    const res = await request(makeApp()).get(`/api/keeta/monitor?token=${vendorToken}`);
    expect(res.status).toBe(403);
  });

  test("no token → pass through (downstream auth decides)", async () => {
    const res = await request(makeApp()).get("/api/keeta/monitor");
    expect(res.status).toBe(200);
  });

  test("invalid token → pass through, never 401/403 from containment", async () => {
    const res = await request(makeApp())
      .get("/api/keeta/monitor")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(200);
  });

  test("pre-populated req.user with role VENDOR is contained without a token", async () => {
    const app = makeApp({ userId: "u-vendor", tenantId: "t-1", role: "VENDOR", vendorId: "v-1" });
    const res = await request(app).get("/api/keeta/monitor");
    expect(res.status).toBe(403);
  });
});
