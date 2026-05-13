// Phase 6 Wave 2a — KeetaScraperAdapter
//
// Refactored from queues/keetaPortalScraperWorker.ts (loadCreds + IngestRun
// pattern preserved verbatim). The queues file's scheduler stays in place
// for Wave 4; this adapter is the IngestAdapter-shaped façade the
// CompositeAdapter consumes.
//
// REQ-ingest-adapter-layer + CON-scraper-replaceable.
// Threat T-06-10 — credentials never leave the local function scope; the
// existing decryptCred / hasEncryptedShape contract is preserved.
// Threat T-06-01 — Spoofing: caller cannot supply an alternate adapter; the
// registry hard-codes the tier order.
//
// Scaffold semantics: until real Playwright selectors ship in Phase 11, the
// fetch* methods return [] when creds are configured (so the composite
// continues to the next tier) and throw NotAvailable when creds are absent
// (so the composite skips this tier entirely). The XLSX fallback below it
// then catches uploads, and Mobile catches AGENT_CAPTURE rows.

import { prisma } from "../../../config";
import { decryptCred, hasEncryptedShape } from "../../../utils/portalCreds";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
} from "../types";

type PortalCreds = { username: string; password: string };

/**
 * Loads + decrypts portal credentials for a single tenant. Returns null
 * when the tenant has no Keeta portal configured. Caller logs only
 * `err.message` on decrypt failure — plaintext is never persisted or
 * surfaced (existing pattern at queues/keetaPortalScraperWorker.ts:24).
 *
 * Accepts both the canonical EncryptedCred shape ({ct, iv, tag}) and any
 * string sentinel that begins with `enc:` (used by older configurations
 * and test fixtures — see __tests__/services/ingest/keeta/keetaAdapter
 * .test.ts:111). The branch is intentionally permissive at `isAvailable`
 * time so the registry can report capability without forcing a decrypt;
 * actual decryption (and hard failure on malformed blobs) is the
 * Playwright path's job in Phase 11.
 */
async function loadCreds(tenantId: string): Promise<PortalCreds | null> {
  // The compound unique `tenantId_platform` carries tenantId one level
  // deep — the no-prisma-without-tenant lint rule only inspects the
  // top-level `where`. The query is still tenant-scoped (the unique key
  // pins tenantId), so we suppress the rule with the canonical
  // queues/keetaPortalScraperWorker.ts:25 pattern preserved verbatim.
  // eslint-disable-next-line no-prisma-without-tenant
  const settings = await prisma.platformSettings.findUnique({
    where: { tenantId_platform: { tenantId, platform: "KEETA" } },
  });
  const pc = (settings?.notificationConfig as { portalCredentials?: { username?: string; password?: unknown } } | null)?.portalCredentials;
  if (!pc?.username) return null;
  if (hasEncryptedShape(pc.password)) {
    return { username: pc.username, password: decryptCred(pc.password) };
  }
  // Legacy/sentinel string format: accept but do not decrypt (Phase 11
  // migrates these to the structured shape).
  if (typeof pc.password === "string" && pc.password.startsWith("enc:")) {
    return { username: pc.username, password: pc.password };
  }
  return null;
}

export class KeetaScraperAdapter implements IngestAdapter {
  readonly platform = "KEETA" as const;
  readonly source = "PORTAL_SCRAPER" as const;

  async isAvailable(tenantId: string): Promise<boolean> {
    const creds = await loadCreds(tenantId);
    return creds !== null;
  }

  async fetchOrders(
    tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    if (!(await this.isAvailable(tenantId))) {
      throw new NotAvailable(
        "No Keeta portal credentials configured for tenant",
      );
    }
    // Scaffold — real Playwright scrape lands in Phase 11.
    return [];
  }

  async fetchShifts(
    tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    if (!(await this.isAvailable(tenantId))) {
      throw new NotAvailable(
        "No Keeta portal credentials configured for tenant",
      );
    }
    return [];
  }

  async fetchAttendance(
    tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    if (!(await this.isAvailable(tenantId))) {
      throw new NotAvailable(
        "No Keeta portal credentials configured for tenant",
      );
    }
    return [];
  }

  async fetchViolations(
    tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    if (!(await this.isAvailable(tenantId))) {
      throw new NotAvailable(
        "No Keeta portal credentials configured for tenant",
      );
    }
    return [];
  }

  async fetchCash(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Keeta scraper does not produce cash records; use XLSX",
    );
  }
}
