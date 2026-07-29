// Darb 2.0 — fleetScope, the /api/fleet/* gate. Mirror of vendorScope, with
// one deliberate difference.
//
// Behaviour contract:
//   - FLEET → pass, untouched. Unlike vendorScope this does NOT require a
//     fleetPartnerId on the token: an owner-group user carries none and picks
//     their active partner downstream in fleetContext, which validates the
//     choice against the group.
//   - ADMIN + ?fleetPartnerId, GET, own tenant → pass, req.user.fleetPartnerId
//     set to it, so fleetContext sees a single-partner fleet user
//   - ADMIN without ?fleetPartnerId → 403
//   - ADMIN, non-GET                → 403 (inspection is read-only)
//   - ADMIN + a partner in another tenant → 404, indistinguishable from one
//     that does not exist
//   - any other role                → 403
//   - no req.user                   → 401

import express from "express";
import request from "supertest";
import { getMockPrisma } from "../setup";
import { fleetScope } from "../../middleware/fleetScope";

// ../config is already swapped for the mock by moduleNameMapper, so the
// delegate just gets attached to it — the house pattern.
const mockPrisma = getMockPrisma();
const findFirst = jest.fn();
(mockPrisma as any).fleetPartner = { findFirst };

function makeApp(preUser?: Record<string, unknown>) {
  const app = express();
  app.use((req: any, _res, next) => {
    if (preUser) req.user = { ...preUser };
    next();
  });
  app.use(fleetScope);
  const echo = (req: any, res: express.Response) => {
    res.json({ ok: true, fleetPartnerId: req.user?.fleetPartnerId ?? null });
  };
  app.get("/roster", echo);
  app.post("/roster", echo);
  return app;
}

const FLEET = { userId: "u1", tenantId: "t-1", role: "FLEET", fleetPartnerId: "f-1" };
const ADMIN = { userId: "u2", tenantId: "t-1", role: "ADMIN" };

beforeEach(() => {
  findFirst.mockReset();
});

describe("fleetScope", () => {
  it("401s when nothing authenticated the request", async () => {
    const res = await request(makeApp()).get("/roster");
    expect(res.status).toBe(401);
  });

  it("passes a fleet token straight through", async () => {
    const res = await request(makeApp(FLEET)).get("/roster");
    expect(res.status).toBe(200);
    expect(res.body.fleetPartnerId).toBe("f-1");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("passes an owner-group fleet token that carries no partner id", async () => {
    // fleetContext resolves this one against the group; the gate must not
    // reject it on the way in.
    const res = await request(makeApp({ ...FLEET, fleetPartnerId: undefined })).get("/roster");
    expect(res.status).toBe(200);
  });

  it("403s a staff role that is not ADMIN", async () => {
    const res = await request(makeApp({ ...ADMIN, role: "SUPERVISOR" })).get(
      "/roster?fleetPartnerId=f-9"
    );
    expect(res.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  describe("admin inspection", () => {
    it("scopes an admin GET to the named partner", async () => {
      findFirst.mockResolvedValue({ id: "f-9" });
      const res = await request(makeApp(ADMIN)).get("/roster?fleetPartnerId=f-9");
      expect(res.status).toBe(200);
      expect(res.body.fleetPartnerId).toBe("f-9");
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "f-9", tenantId: "t-1" },
        select: { id: true },
      });
    });

    it("403s an admin who names no partner", async () => {
      const res = await request(makeApp(ADMIN)).get("/roster");
      expect(res.status).toBe(403);
      expect(findFirst).not.toHaveBeenCalled();
    });

    it("403s a write, so inspection cannot become acting as the partner", async () => {
      findFirst.mockResolvedValue({ id: "f-9" });
      const res = await request(makeApp(ADMIN)).post("/roster?fleetPartnerId=f-9");
      expect(res.status).toBe(403);
      expect(findFirst).not.toHaveBeenCalled();
    });

    it("404s a partner in another tenant, indistinguishably from one that does not exist", async () => {
      findFirst.mockResolvedValue(null);
      const res = await request(makeApp(ADMIN)).get("/roster?fleetPartnerId=f-other");
      expect(res.status).toBe(404);
    });
  });
});
