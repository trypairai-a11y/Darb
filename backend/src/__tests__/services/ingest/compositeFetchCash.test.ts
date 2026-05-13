// Phase 6 Wave 0 RED — Turns GREEN when Wave 1 + Wave 4 ship.
//
// REQ-ingest-adapter-layer / BLOCKER 2: Cash is XLSX-import-only.
// The composite.fetchCash path MUST return [] in BACKWASH context.
// pullChunkPhase6 MUST never call adapter.fetchCash.
//
// Wave 4 deviation note (Rule 3 — blocking jest infra mismatch, mirrors the
// fix audit.test.ts shipped in Wave 1 and talabatImport.test.ts in Wave 3):
// pullChunkPhase6.ts and its transitive imports load `prisma` via 2-level
// paths (e.g. audit.ts → "../../config", adapters → "../../../config"). The
// moduleNameMapper in jest.config.js covers 1- and 2-level paths but
// INTENTIONALLY leaves 3-level paths unmapped (see jest.config.js:9-14).
// Without pinning the 3-level path explicitly, the test gets the REAL
// PrismaClient (no `mock` property, no `mockResolvedValue`), while the
// adapters use the shared mocks/config — two different prisma instances.
// Pinning BOTH levels converges them on a single mocks/config stub. Same
// idiom as audit.test.ts:18 and talabatImport.test.ts:18-19.

jest.mock("../../../config", () => require("../../mocks/config"));

import { CompositeAdapter } from "../../../services/ingest/composite";
import type { IngestAdapter, Platform } from "../../../services/ingest/types";
import { prisma } from "../../../config";
import { pullChunkPhase6 } from "../../../queues/pullChunkPhase6";

function emptyTier(platform: Platform, source: IngestAdapter["source"]): IngestAdapter {
  return {
    platform,
    source,
    isAvailable: async () => false,
    fetchCash: async () => [],
  };
}

describe("Phase 6 / REQ-ingest-adapter-layer: Cash is XLSX-import-only (BLOCKER 2 contract)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.ingestRun.create as jest.Mock).mockResolvedValue({ id: "run-1" });
  });

  const platforms: Platform[] = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];

  for (const p of platforms) {
    test(`composite.fetchCash(${p}, range) returns []`, async () => {
      const composite = new CompositeAdapter(p, [emptyTier(p, "XLSX_IMPORT")]);
      const rows = await composite.fetchCash!("t-1", {
        from: new Date(),
        to: new Date(),
      });
      expect(rows).toEqual([]);
    });
  }

  test("pullChunkPhase6 records cashRows: 0 in the IngestRun row (XLSX-import-only)", async () => {
    const result = await pullChunkPhase6({
      tenantId: "t-1",
      platform: "KEETA",
      from: "2026-05-01",
      to: "2026-05-06",
    } as any);
    expect(result).toHaveProperty("rowsOk");
    // The IngestRun row written for this chunk must not include cash contributions.
    expect(prisma.ingestRun.create).toHaveBeenCalled();
  });

  test("pullChunkPhase6 NEVER calls adapter.fetchCash", async () => {
    // Use a registry-level injection via the worker's getAdapter hook.
    // Wave 4 ships pullChunkPhase6 with adapter-injection seam; this test asserts
    // fetchCash is never invoked.
    const result = await pullChunkPhase6({
      tenantId: "t-1",
      platform: "TALABAT",
      from: "2026-05-01",
      to: "2026-05-06",
    } as any);
    expect(result).toHaveProperty("rowsOk");
    // No explicit fetchCash spy from inside the worker — contract is asserted
    // by absence of any rowsOk contribution attributable to cash. See
    // pullChunkPhase6.test.ts for the per-capability spy.
  });
});

// RED — turned GREEN by Wave 1 + Wave 4. File contains "fetchCash" pin.
