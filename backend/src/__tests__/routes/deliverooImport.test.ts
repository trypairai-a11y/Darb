// Phase 6 Wave 0 RED — Turns GREEN when Wave 3 ships
// backend/src/routes/deliveroo.ts::POST /import.
//
// REQ-ingest-adapter-layer: POST /api/deliveroo/import — same shape as Talabat.
//
// Wave 3 deviation note: same jest infra mismatch as talabatImport.test.ts.
// See that file's header comment for the full diagnosis. Short version: the
// moduleNameMapper rewrites the route's 2-level `../config` to mocks/config.ts
// but leaves the adapter's 3-level `../../../config` unmapped — so without
// intervention the test sees mocks/config.ts and the adapter sees the real
// PrismaClient. Fix: jest.doMock with an absolute path keyed by the adapter's
// resolved src/config target.

import path from "path";
import request from "supertest";
import express from "express";

const ABS_SRC_CONFIG = path.resolve(__dirname, "..", "..", "config");

// Route the adapter's 3-level `../../../config` import to the shared mock.
jest.doMock(ABS_SRC_CONFIG, () => require("../mocks/config"));

import { prisma } from "../../config";
// require() (not import) so the doMock above is registered first.
const deliverooRouter = require("../../routes/deliveroo").default;
import { buildDeliverooXlsxBuffer } from "../services/ingest/fixtures";

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { tenantId: "t-1", userId: "u-1", role: "ADMIN" };
    next();
  });
  app.use("/api/deliveroo", deliverooRouter);
  return app;
}

describe("Phase 6 / REQ-ingest-adapter-layer: POST /api/deliveroo/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
    );
    (prisma.deliverooDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "ddm-1" });
    (prisma.ingestRun.create as jest.Mock).mockResolvedValue({ id: "run-1" });
  });

  test("valid XLSX upload → 200 {success, rowsIn, rowsOk, errors}", async () => {
    const app = makeApp();
    const buf = buildDeliverooXlsxBuffer();
    const res = await request(app)
      .post("/api/deliveroo/import")
      .attach("file", buf, { filename: "deliveroo.xlsx" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        rowsIn: expect.any(Number),
        rowsOk: expect.any(Number),
        errors: expect.any(Array),
      }),
    );
  });

  test("no file → 400 with error message", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/deliveroo/import");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("writes IngestRun row with platform=DELIVEROO, source=XLSX_IMPORT, status=SUCCESS", async () => {
    const app = makeApp();
    const buf = buildDeliverooXlsxBuffer();
    await request(app)
      .post("/api/deliveroo/import")
      .attach("file", buf, { filename: "x.xlsx" });
    expect(prisma.ingestRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-1",
          platform: "DELIVEROO",
          source: "XLSX_IMPORT",
          status: "SUCCESS",
        }),
      }),
    );
  });

  test("duplicate upload → idempotent rowsOk", async () => {
    const app = makeApp();
    const buf = buildDeliverooXlsxBuffer();
    const a = await request(app).post("/api/deliveroo/import").attach("file", buf, { filename: "x.xlsx" });
    const b = await request(app).post("/api/deliveroo/import").attach("file", buf, { filename: "x.xlsx" });
    expect(a.body.rowsOk).toBe(b.body.rowsOk);
  });

  test("cross-tenant driver_id rejected (Pitfall 3)", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const app = makeApp();
    const buf = buildDeliverooXlsxBuffer();
    const res = await request(app)
      .post("/api/deliveroo/import")
      .attach("file", buf, { filename: "x.xlsx" });
    expect(res.status).toBe(200);
    expect(res.body.rowsOk).toBe(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

// RED — turned GREEN by Wave 3. File contains "POST /api/deliveroo/import" pin.
