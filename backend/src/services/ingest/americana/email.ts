// Phase 6 Wave 2a — AmericanaEmailAdapter
//
// Thin re-export shim around services/americanaInboxWatcher.ts per
// orchestrator resolution #5 — no relocation of the existing watcher
// module, just an IngestAdapter-shaped façade so the CompositeAdapter
// can include it in the precedence chain.
//
// REQ-ingest-adapter-layer.
//
// Capability gate (isAvailable) reads PlatformSettings.notificationConfig
// .americanaInbox (the new canonical config slot) — Wave 4 will migrate the
// existing tenant.settings.americana.ingest readers to this same location.
// The legacy `pollTenantInbox(tenantId, cfg)` signature still lives in
// americanaInboxWatcher.ts unchanged, so the scheduled watcher and the
// adapter share a single implementation.

import { prisma } from "../../../config";
import { pollTenantInbox } from "../../americanaInboxWatcher";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
} from "../types";

interface InboxConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  password: string;
  mailbox?: string;
}

interface AmericanaInboxNotificationConfig {
  americanaInbox?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    mailbox?: string;
  };
}

/**
 * Read the canonical PlatformSettings.notificationConfig.americanaInbox
 * slot. Returns null when the tenant has not configured an IMAP source
 * — the composite then falls through to the XLSX tier.
 */
async function loadInboxConfig(tenantId: string): Promise<InboxConfig | null> {
  // eslint-disable-next-line no-prisma-without-tenant
  const settings = await prisma.platformSettings.findUnique({
    where: { tenantId_platform: { tenantId, platform: "AMERICANA" } },
  });
  const cfg = (settings?.notificationConfig as AmericanaInboxNotificationConfig | null)?.americanaInbox;
  if (!cfg?.host || !cfg.user || !cfg.password) return null;
  return {
    host: cfg.host,
    port: cfg.port ?? 993,
    secure: cfg.secure !== false,
    user: cfg.user,
    password: cfg.password,
    mailbox: cfg.mailbox ?? "INBOX",
  };
}

export class AmericanaEmailAdapter implements IngestAdapter {
  readonly platform = "AMERICANA" as const;
  readonly source = "EMAIL_INBOX" as const;

  async isAvailable(tenantId: string): Promise<boolean> {
    const cfg = await loadInboxConfig(tenantId);
    return cfg !== null;
  }

  /**
   * Push-driven poll. `run()` is the IngestAdapter-shaped façade around
   * the existing `pollTenantInbox` so callers (CompositeAdapter
   * consumers, Wave 4's scheduler refactor, manual ops scripts) all share
   * one entry point. Returns the staged-message count from the watcher.
   */
  async run(tenantId: string): Promise<number> {
    const cfg = await loadInboxConfig(tenantId);
    if (!cfg) {
      throw new NotAvailable(
        "No Americana IMAP inbox configured for tenant",
      );
    }
    return pollTenantInbox(tenantId, cfg);
  }

  async fetchOrders(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Americana email adapter is push-driven; use run() to poll inbox",
    );
  }

  async fetchShifts(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable("Americana email adapter does not produce shifts");
  }

  async fetchAttendance(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Americana email adapter does not produce attendance",
    );
  }

  async fetchCash(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Americana email adapter does not produce cash records",
    );
  }

  async fetchViolations(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Americana email adapter does not produce violations",
    );
  }
}
