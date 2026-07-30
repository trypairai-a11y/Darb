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
    test.each([
      ["OWNER", ["ORDERS", "WALLET", "GROW", "SUPPORT", "TEAM", "SETTINGS"]],
      ["FINANCE", ["ORDERS", "WALLET", "GROW", "SUPPORT"]],
      ["ORDER_TRACKING", ["ORDERS", "SUPPORT"]],
    ])("%s falls back to exactly the fences that were already in force", (role, expected) => {
      expect(effectiveVendorTabs(role, null)).toEqual(expected);
    });

    test("an unknown or missing role is treated as OWNER, as the portal always did", () => {
      expect(effectiveVendorTabs(null, null)).toEqual(ROLE_DEFAULT_TABS.OWNER);
      expect(effectiveVendorTabs(undefined, null)).toEqual(ROLE_DEFAULT_TABS.OWNER);
      expect(effectiveVendorTabs("SOMETHING_ELSE", null)).toEqual(ROLE_DEFAULT_TABS.OWNER);
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
      expect(effectiveVendorTabs("OWNER", null)).toEqual(ROLE_DEFAULT_TABS.OWNER);
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
});
