import { PrismaClient } from "../generated/prisma";
import { prismaExtensions } from "./prismaExtensions";

// Prisma's default interactive-transaction timeout is 5s. The wallet postings
// (postCodSettlement → ensureAccount x3 → postLedgerTransaction's per-leg
// update+insert) run ~20 sequential round trips inside one transaction, which
// exceeds 5s against a pooled Neon endpoint and rolls the settlement back.
// Override PRISMA_TX_TIMEOUT_MS to tune per host.
const TX_TIMEOUT_MS = Number(process.env.PRISMA_TX_TIMEOUT_MS ?? 20_000);
const TX_MAX_WAIT_MS = Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 10_000);

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  transactionOptions: { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
});

const prisma = basePrisma.$extends(prismaExtensions) as unknown as PrismaClient;

export default prisma;
