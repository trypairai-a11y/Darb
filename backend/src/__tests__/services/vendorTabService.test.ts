// Revision 10 (#6) — per-user merchant-portal tab access.
//
// The contract that matters most here is the one about NOT changing anything:
// a login with no override must behave exactly as it did before per-user tabs
// existed, because this shipped with no backfill and every shop login in
// production has a null column.
import {
  ROLE_DEFAULT_TABS,
  VENDOR_TABS,
  effectiveVendorTabs,
  parseVendorTabs,
} from "../../services/vendorTabService";

describe("vendorTabService", () => {
  describe("effectiveVendorTabs — no override (the migration case)", () => {
    // Client note (2026-08-31, edit #8): the stored legacy trio must keep
    // opening exactly what it always opened, because nothing was backfilled.
    //
    // Vendor-portal note #2 (2026-09-15) removed GROW, and these lists moved
    // with it. That is the one deliberate exception to the "nothing changes"
    // contract above: a tab that no longer exists cannot be in a default set,
    // and the removal is safe precisely because it needs no backfill — see the
    // stored-override case further down, which proves a saved GROW drops out
    // on read rather than throwing.
    test.each([
      ["OWNER", ["ORDERS", "WALLET", "SUPPORT", "TEAM", "SETTINGS"]],
      ["FINANCE", ["ORDERS", "WALLET", "SUPPORT"]],
      ["ORDER_TRACKING", ["ORDERS", "SUPPORT"]],
      ["ADMIN", ["ORDERS", "WALLET", "SUPPORT", "TEAM", "SETTINGS"]],
      ["ACCOUNTANT", ["ORDERS", "WALLET", "SUPPORT"]],
      ["SUPERVISOR", ["ORDERS", "SUPPORT"]],
      ["OPS_MANAGER", ["ORDERS", "SUPPORT"]],
      ["ACCOUNT_MANAGER", ["ORDERS", "SUPPORT"]],
      ["VIEWER", ["ORDERS", "SUPPORT"]],
    ])("%s falls back to exactly the fences that were already in force", (role, expected) => {
      expect(effectiveVendorTabs(role, null)).toEqual(expected);
    });

    test("an unknown or missing role is treated as ADMIN, as the portal always treated OWNER", () => {
      expect(effectiveVendorTabs(null, null)).toEqual(ROLE_DEFAULT_TABS.ADMIN);
      expect(effectiveVendorTabs(undefined, null)).toEqual(ROLE_DEFAULT_TABS.ADMIN);
      expect(effectiveVendorTabs("SOMETHING_ELSE", null)).toEqual(ROLE_DEFAULT_TABS.ADMIN);
    });
  });

  describe("effectiveVendorTabs — with an override", () => {
    test("the override replaces the role's set, narrowing it", () => {
      expect(effectiveVendorTabs("OWNER", ["ORDERS"])).toEqual(["ORDERS"]);
    });

    test("the override can also widen a role — an owner's call about their own staff", () => {
      // ORDER_TRACKING has no WALLET by default. Granting it is deliberate.
      expect(effectiveVendorTabs("ORDER_TRACKING", ["ORDERS", "WALLET"])).toEqual([
        "ORDERS",
        "WALLET",
      ]);
    });

    test("an explicit empty list means no tabs, which is different from inherit", () => {
      expect(effectiveVendorTabs("OWNER", [])).toEqual([]);
      expect(effectiveVendorTabs("OWNER", null)).toEqual(ROLE_DEFAULT_TABS.ADMIN);
    });
  });

  describe("parseVendorTabs", () => {
    test("returns null for anything that is not an array, so a stray value inherits", () => {
      // A bad value in one row must never lock a shop out of its own portal.
      expect(parseVendorTabs(null)).toBeNull();
      expect(parseVendorTabs(undefined)).toBeNull();
      expect(parseVendorTabs("ORDERS")).toBeNull();
      expect(parseVendorTabs({ ORDERS: true })).toBeNull();
      expect(parseVendorTabs(7)).toBeNull();
    });

    test("drops values that are not tabs rather than failing the whole list", () => {
      expect(parseVendorTabs(["ORDERS", "NOT_A_TAB", "WALLET"])).toEqual(["ORDERS", "WALLET"]);
    });

    test("de-duplicates and returns canonical order, so equivalent lists compare equal", () => {
      expect(parseVendorTabs(["WALLET", "ORDERS", "WALLET"])).toEqual(["ORDERS", "WALLET"]);
      expect(parseVendorTabs(["SETTINGS", "ORDERS"])).toEqual(["ORDERS", "SETTINGS"]);
    });

    test("every tab the portal has is accepted", () => {
      expect(parseVendorTabs([...VENDOR_TABS])).toEqual([...VENDOR_TABS]);
    });
  });

  describe("a removed tab (vendor-portal note #2, 2026-09-15)", () => {
    test("GROW is gone from the catalogue", () => {
      expect(VENDOR_TABS).not.toContain("GROW");
      for (const tabs of Object.values(ROLE_DEFAULT_TABS)) {
        expect(tabs).not.toContain("GROW");
      }
    });

    test("a stored override that still lists GROW reads back without it", () => {
      // This is why the removal needed no backfill and no migration: the
      // override is filtered through isVendorTab on every read, so a shop whose
      // accountant was explicitly granted Grow simply stops being offered it.
      expect(effectiveVendorTabs("ACCOUNTANT", ["ORDERS", "GROW", "WALLET"])).toEqual([
        "ORDERS",
        "WALLET",
      ]);
      expect(parseVendorTabs(["GROW"])).toEqual([]);
    });

    test("an override of ONLY GROW is an empty list, not a fallback to the role", () => {
      // The distinction matters: [] means "no tabs", null means "inherit". A
      // list that empties out on read must not silently re-open the role's set.
      expect(effectiveVendorTabs("ADMIN", ["GROW"])).toEqual([]);
    });
  });
});
