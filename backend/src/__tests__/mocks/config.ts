// Mock Prisma and Redis for unit tests
import { makeAgentMocks } from "./agentMocks";

// Spread agent-model mocks into the prisma stub. The 5 NEW Phase 1 models
// covered by makeAgentMocks() are:
//   - agentAction         (REQ-data-agent-action — audit ledger)
//   - agentMemory         (REQ-data-agent-memory — append-only key/value)
//   - pinnedView          (REQ-data-pinned-view — per-user saved views)
//   - performanceSnapshot (REQ-data-performance-snapshot — daily score snapshot)
//   - metricEvent         (REQ-data-metric-event — in-product analytics)
// Plus the existing agentRunLog (used by ledger.test.ts FK assertions).
// Exported separately so tests can grab the same instances:
//   import { agentMocks, prisma } from "../mocks/config";
export const agentMocks = makeAgentMocks();

export const prisma = {
  ...agentMocks,
  alert: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  talabatViolationEvent: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  driver: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  driverInventory: {
    createMany: jest.fn(),
  },
  company: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  orderLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  shift: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  cashRecord: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  pendingDuesLedger: {
    findMany: jest.fn(),
  },
  talabatSession: {
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  attendanceRecord: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  // AgentToolCall is written by the registry's invoke() on every tool call —
  // mock it so toolRegistry.invoke doesn't crash on undefined.create. The
  // tenantIsolation test asserts where-clause shape on the read-side
  // delegates, not on agentToolCall.
  agentToolCall: {
    create: jest.fn(),
  },
  // PendingAgentAction is written by the registry when a tool requires
  // approval. Phase 1 read tools don't, but mock it so future write-tool
  // tests don't crash either.
  pendingAgentAction: {
    create: jest.fn(),
  },
  platformSettings: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveRequest: {
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  // Phase 5 (mobile GPS beacon) — Wave 0 RED tests reference these delegates.
  locationLog: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  courierOnlineSession: {
    // CourierOnlineSession has no @@unique suitable for prisma.upsert, so the
    // /api/agent/location handler uses findFirst + update OR create. `upsert`
    // is kept here for legacy tests; new tests should mock findFirst/update/create.
    upsert: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  orderEvent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  device: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  // Phase 6 Wave 1 — ingest audit trail (writeIngestRun). Wave 0 audit.test.ts
  // and compositeFetchCash.test.ts both reach for prisma.ingestRun.create
  // (the latter via the inline jest.mock factory; the former via the
  // moduleNameMapper-routed mocks/config). Surfacing it here keeps both
  // paths reachable.
  ingestRun: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  // Phase 6 Wave 3 — XLSX-fallback ingest routes (talabatImport.test.ts,
  // deliverooImport.test.ts). Both route tests pin "../../../config" to this
  // shared mock so the adapter's 3-level import shares the same prisma stub
  // as the test (Rule 3 fix mirroring audit.test.ts:19).
  talabatDailyMetrics: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  deliverooDailyMetrics: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

export const redis = null;

// `env` is a Proxy so per-test overrides via process.env (e.g. setting
// ANTHROPIC_API_KEY in the agentScheduler test) flow through. Static fields
// stay constant; everything else falls back to process.env at read time.
const envBase: Record<string, unknown> = {
  PORT: 3001,
  JWT_SECRET: "test",
  JWT_REFRESH_SECRET: "test",
  REDIS_URL: "",
};
export const env = new Proxy(envBase, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return process.env[prop];
  },
});

// `logger` mock — pino-style API. Defensively no-ops so tests that
// indirectly invoke logger.<level> don't crash. The agent/registry +
// agent/scheduler import it via `from "../config/logger"` which the
// jest moduleNameMapper folds into this same mocks/config file.
export const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: () => logger,
};
