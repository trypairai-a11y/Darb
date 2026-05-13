// Phase 6 Wave 0 RED — Turns GREEN when Wave 3 ships
// backend/src/routes/talabat.ts::POST /import.
//
// REQ-ingest-adapter-layer: POST /api/talabat/import — canonical XLSX upload shape
// {success, rowsIn, rowsOk, errors} per CON-xlsx-fallback. Mirrors Keeta /import.
//
// Wave 3 deviation note (Rule 3 — blocking jest infra mismatch): jest.config.js
// `moduleNameMapper` rewrites the route file's `from "../config"` to
// src/__tests__/mocks/config.ts, but the TalabatXlsxAdapter (loaded
// transitively via the route) imports `from "../../../config"` — a 3-level
// path that the mapper intentionally leaves unmapped (Phase 1 agent/tools
// tests rely on the unmapped path). Without intervention the test and the
// adapter end up with TWO different prisma instances (mock vs. real).
//
// Fix: use jest.doMock with an ABSOLUTE PATH to register a mock keyed at
// the resolved src/config module file. Because the moduleNameMapper rewrites
// happen on the import-request string (not the resolved file path), this
// bypasses the mapper. The factory returns the shared mocks/config.ts so
// the adapter and the test converge on a single prisma stub. Then we
// require() the router so the doMock takes effect BEFORE the router's
// transitive adapter import loads.

import path from "path";
import request from "supertest";
import express from "express";

// Compute absolute path to src/config from this test file's __dirname.
// `path.resolve` runs at module-load time but BEFORE the require() below,
// which is what matters for doMock + require ordering.
const ABS_SRC_CONFIG = path.resolve(__dirname, "..", "..", "config");

// Route the adapter's 3-level `../../../config` import to the shared mock.
// doMock (not jest.mock) is intentional: jest.mock requires a literal first
// arg for hoisting; absolute paths via path.resolve are computed.
jest.doMock(ABS_SRC_CONFIG, () => require("../mocks/config"));

// The test's own `import { prisma } from "../../config"` is rewritten by the
// moduleNameMapper to the shared mock — so test-side `prisma` is already the
// same instance the adapter now sees via the doMock above.
import { prisma } from "../../config";
// require() (not import) so the doMock above is registered first.
const talabatRouter = require("../../routes/talabat").default;
import { buildTalabatXlsxBuffer } from "../services/ingest/fixtures";

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { tenantId: "t-1", userId: "u-1", role: "ADMIN" };
    next();
  });
  app.use("/api/talabat", talabatRouter);
  return app;
}

describe("Phase 6 / REQ-ingest-adapter-layer: POST /api/talabat/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
    );
    (prisma.talabatDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "tdm-1" });
    (prisma.ingestRun.create as jest.Mock).mockResolvedValue({ id: "run-1" });
  });

  test("valid XLSX upload → 200 {success: true, rowsIn: N, rowsOk: M, errors: []}", async () => {
    const app = makeApp();
    const buf = buildTalabatXlsxBuffer();
    const res = await request(app)
      .post("/api/talabat/import")
      .attach("file", buf, { filename: "talabat.xlsx" });
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

  test("no file in multipart body → 400 {error: 'No file uploaded'}", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/talabat/import");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("writes IngestRun row {tenantId, platform: 'TALABAT', source: 'XLSX_IMPORT', status: 'SUCCESS'}", async () => {
    const app = makeApp();
    const buf = buildTalabatXlsxBuffer();
    await request(app)
      .post("/api/talabat/import")
      .attach("file", buf, { filename: "talabat.xlsx" });
    expect(prisma.ingestRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-1",
          platform: "TALABAT",
          source: "XLSX_IMPORT",
          status: "SUCCESS",
        }),
      }),
    );
  });

  test("duplicate upload (same buffer twice) → idempotent (no row-count doubling)", async () => {
    const app = makeApp();
    const buf = buildTalabatXlsxBuffer();
    const a = await request(app).post("/api/talabat/import").attach("file", buf, { filename: "x.xlsx" });
    const b = await request(app).post("/api/talabat/import").attach("file", buf, { filename: "x.xlsx" });
    expect(a.body.rowsOk).toBe(b.body.rowsOk);
  });

  test("uploaded XLSX with driver_id from a different tenant → errors[] entry; cross-tenant rejection (Pitfall 3)", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const app = makeApp();
    const buf = buildTalabatXlsxBuffer();
    const res = await request(app)
      .post("/api/talabat/import")
      .attach("file", buf, { filename: "x.xlsx" });
    expect(res.status).toBe(200);
    expect(res.body.rowsOk).toBe(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

// RED — turned GREEN by Wave 3. File contains "POST /api/talabat/import" pin.
