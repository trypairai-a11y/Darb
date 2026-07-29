// Darb 2.0 — vendorScope, the /api/vendor/* gate.
//
// Behaviour contract:
//   - VENDOR + vendorId in the JWT  → pass, vendorId untouched
//   - VENDOR without a vendorId     → 403 (a vendor token that cannot scope)
//   - ADMIN + ?vendorId, GET, own tenant → pass, req.user.vendorId set to it
//   - ADMIN without ?vendorId       → 403
//   - ADMIN, non-GET                → 403 (inspection is read-only)
//   - ADMIN + a vendorId in another tenant → 404, same as one that does not
//     exist, so this cannot be used to probe which ids are real
//   - any other role                → 403
//   - no req.user                   → 401

import express from "express";
import request from "supertest";
import { getMockPrisma } from "../setup";
import { vendorScope } from "../../middleware/vendorScope";

// ../config is already swapped for the mock by moduleNameMapper, so the
// delegate just gets attached to it — the house pattern.
const mockPrisma = getMockPrisma();
const findFirst = jest.fn();
(mockPrisma as any).vendor = { findFirst };

/** Mounts vendorScope behind a fake authMiddleware that plants req.user. */
function makeApp(preUser?: Record<string, unknown>) {
  const app = express();
  app.use((req: any, _res, next) => {
    if (preUser) req.user = { ...preUser };
    next();
  });
  app.use(vendorScope);
  const echo = (req: any, res: express.Response) => {
    res.json({ ok: true, vendorId: req.user?.vendorId ?? null });
  };
  app.get("/orders", echo);
  app.post("/orders", echo);
  return app;
}

const VENDOR = { userId: "u1", tenantId: "t-1", role: "VENDOR", vendorId: "v-1" };
const ADMIN = { userId: "u2", tenantId: "t-1", role: "ADMIN" };

beforeEach(() => {
  findFirst.mockReset();
});

describe("vendorScope", () => {
  it("401s when nothing authenticated the request", async () => {
    const res = await request(makeApp()).get("/orders");
    expect(res.status).toBe(401);
  });

  it("passes a vendor token straight through on its own vendorId", async () => {
    const res = await request(makeApp(VENDOR)).get("/orders");
    expect(res.status).toBe(200);
    expect(res.body.vendorId).toBe("v-1");
    // No lookup: the id came from the signed token, so there is nothing to check.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("403s a vendor token carrying no vendorId", async () => {
    const res = await request(makeApp({ ...VENDOR, vendorId: undefined })).get("/orders");
    expect(res.status).toBe(403);
  });

  it("403s a staff role that is not ADMIN", async () => {
    const res = await request(makeApp({ ...ADMIN, role: "OPS_MANAGER" })).get(
      "/orders?vendorId=v-9"
    );
    expect(res.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  describe("admin inspection", () => {
    it("scopes an admin GET to the named vendor", async () => {
      findFirst.mockResolvedValue({ id: "v-9" });
      const res = await request(makeApp(ADMIN)).get("/orders?vendorId=v-9");
      expect(res.status).toBe(200);
      expect(res.body.vendorId).toBe("v-9");
      // Scoped to the admin's own tenant, never to the id alone.
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "v-9", tenantId: "t-1" },
        select: { id: true },
      });
    });

    it("403s an admin who names no vendor", async () => {
      const res = await request(makeApp(ADMIN)).get("/orders");
      expect(res.status).toBe(403);
      expect(findFirst).not.toHaveBeenCalled();
    });

    it("403s a write, so inspection cannot become acting as the merchant", async () => {
      findFirst.mockResolvedValue({ id: "v-9" });
      const res = await request(makeApp(ADMIN)).post("/orders?vendorId=v-9");
      expect(res.status).toBe(403);
      // Refused before the lookup — the method alone settles it.
      expect(findFirst).not.toHaveBeenCalled();
    });

    it("404s a vendor in another tenant, indistinguishably from one that does not exist", async () => {
      findFirst.mockResolvedValue(null);
      const res = await request(makeApp(ADMIN)).get("/orders?vendorId=v-other");
      expect(res.status).toBe(404);
    });
  });
});
