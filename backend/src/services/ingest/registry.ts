// Phase 6 Waves 2a + 2b — getAdapter factory (per-platform CompositeAdapter).
//
// Wave 2a shipped KEETA + AMERICANA tier arrays. Wave 2b fills the remaining
// TALABAT + DELIVEROO case branches without touching 2a's case ordering —
// the alphabetical `case` layout was the 2a/2b parallelisation contract, so
// each wave appended only its own barrel import (lines 17-20 below).
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
import { deliverooTiers } from "./deliveroo";
import { keetaTiers } from "./keeta";
import { talabatTiers } from "./talabat";

export interface AdapterContext {
  tenantId: string;
}

export function getAdapter(
  platform: Platform,
  _ctx: AdapterContext,
): CompositeAdapter {
  switch (platform) {
    // --- 2a (shipped) ---
    case "AMERICANA":
      return new CompositeAdapter("AMERICANA", americanaTiers);
    case "KEETA":
      return new CompositeAdapter("KEETA", keetaTiers);
    // --- 2b (this wave) ---
    case "DELIVEROO":
      // Wave 2b tiers: [DeliverooMobileAdapter, DeliverooOcrAdapter,
      //                 DeliverooXlsxAdapter, DeliverooScraperAdapter (NotAvailable)]
      return new CompositeAdapter("DELIVEROO", deliverooTiers);
    case "TALABAT":
      // Wave 2b tiers: [TalabatMobileAdapter, TalabatOcrAdapter,
      //                 TalabatXlsxAdapter, TalabatScraperAdapter (NotAvailable)]
      return new CompositeAdapter("TALABAT", talabatTiers);
    default: {
      const exhaustive: never = platform;
      throw new Error(`Unknown platform: ${exhaustive as string}`);
    }
  }
}
