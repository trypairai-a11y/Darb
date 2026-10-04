/**
 * Revision 21c — "must fill all the cells to be active".
 *
 * The rule for what a complete shop or delivery company is lives in one
 * function each, and the list badge, the detail checklist, the activation
 * guard and the Admin card all read it. These pin the rule down.
 */
import { fleetSetupMissing, vendorSetupMissing } from "../../../services/onboarding/setupCompleteness";

describe("vendorSetupMissing", () => {
  it("names every empty cell on a freshly approved shop", () => {
    expect(vendorSetupMissing({ phone: null, branchCount: 0, userCount: 0 })).toEqual([
      "PHONE",
      "BRANCH",
      "LOGIN",
    ]);
  });

  it("treats a blank phone as missing, not as filled", () => {
    expect(vendorSetupMissing({ phone: "   ", branchCount: 1, userCount: 1 })).toEqual(["PHONE"]);
  });

  it("is empty once a phone, a branch and a login exist", () => {
    expect(vendorSetupMissing({ phone: "+96522250101", branchCount: 1, userCount: 1 })).toEqual([]);
  });
});

describe("fleetSetupMissing", () => {
  it("needs a contact number and a login, and deliberately not drivers", () => {
    expect(fleetSetupMissing({ contactPhone: null, userCount: 0 })).toEqual(["CONTACT_PHONE", "LOGIN"]);
    expect(fleetSetupMissing({ contactPhone: "+96599000000", userCount: 1 })).toEqual([]);
  });
});
