import { Platform } from "../generated/prisma";
import { PlatformAdapter } from "./PlatformAdapter";
import { talabatAdapter } from "./talabatAdapter";
import { keetaAdapter } from "./keetaAdapter";
import { americanaAdapter } from "./americanaAdapter";
import { deliverooAdapter } from "./deliverooAdapter";

// Partial by design: DARB (the 2.0 delivery platform) has no legacy
// scraper/ingest adapter — getAdapter throws for it, which is correct.
const registry: Partial<Record<Platform, PlatformAdapter>> = {
  TALABAT: talabatAdapter,
  KEETA: keetaAdapter,
  AMERICANA: americanaAdapter,
  DELIVEROO: deliverooAdapter,
};

export function getAdapter(platform: Platform | string): PlatformAdapter {
  const adapter = registry[platform as Platform];
  if (!adapter) throw new Error(`No adapter registered for platform ${platform}`);
  return adapter;
}

export { PlatformAdapter, DriverSummary, NotSupportedError } from "./PlatformAdapter";
