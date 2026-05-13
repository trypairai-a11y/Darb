// Phase 6 Wave 2a — getAdapter factory (per-platform CompositeAdapter).
//
// This wave fills KEETA + AMERICANA tier arrays. Wave 2b ships TALABAT +
// DELIVEROO and will edit the two remaining `case` branches below — the
// 2a / 2b split keeps the merge surface alphabetical so the two waves
// can run in parallel without conflicting on this file.
//
// Threat T-06-01 (Spoofing) — there is no caller-supplied adapter
// substitution path. The composition is hard-coded per Platform here, so
// a malicious caller cannot inject a custom adapter at runtime. Per-tenant
// precedence overrides are deferred to Phase 11 (orchestrator resolution
// #4) and will land via a separate registry-extension hook, not by
// loosening this factory's signature.

import { CompositeAdapter } from "./composite";
import type { Platform } from "./types";
import { americanaTiers } from "./americana";
import { keetaTiers } from "./keeta";

export interface AdapterContext {
  tenantId: string;
}

export function getAdapter(
  platform: Platform,
  _ctx: AdapterContext,
): CompositeAdapter {
  switch (platform) {
    // --- 2a (this wave) ---
    case "AMERICANA":
      return new CompositeAdapter("AMERICANA", americanaTiers);
    case "KEETA":
      return new CompositeAdapter("KEETA", keetaTiers);
    // --- 2b (pending) ---
    case "DELIVEROO":
      // Wave 2b tiers: [DeliverooMobileAdapter, DeliverooOcrAdapter,
      //                 DeliverooXlsxAdapter, DeliverooScraperAdapter (NotAvailable)]
      return new CompositeAdapter("DELIVEROO", []);
    case "TALABAT":
      // Wave 2b tiers: [TalabatMobileAdapter, TalabatOcrAdapter,
      //                 TalabatXlsxAdapter, TalabatScraperAdapter (NotAvailable)]
      return new CompositeAdapter("TALABAT", []);
    default: {
      const exhaustive: never = platform;
      throw new Error(`Unknown platform: ${exhaustive as string}`);
    }
  }
}
