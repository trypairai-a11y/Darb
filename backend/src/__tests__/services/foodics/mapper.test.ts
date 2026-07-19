// Foodics mapper — fixture-driven unit tests (plan §A6). The fixtures are
// hand-built from the documented webhook fields and MUST be re-recorded
// against the Foodics sandbox before go-live.

import {
  extractFoodicsEnvelope,
  isFoodicsOrderInactive,
  isSkip,
  mapFoodicsOrder,
  orderHasTag,
} from "../../../services/foodics/mapper";
import { CreateOrderInput } from "../../../services/orderService";

import codFixture from "../../fixtures/foodics/order.delivery.created.cod.json";
import prepaidFixture from "../../fixtures/foodics/order.delivery.created.prepaid.json";
import missingCoordsFixture from "../../fixtures/foodics/order.delivery.created.missing-coords.json";

const FOODICS_BRANCH_ID = "b7a11111-2222-4333-8444-555566667777";

function ctx(overrides: Partial<{ branchByFoodicsId: Map<string, { id: string }> }> = {}) {
  return {
    tenantId: "t-1",
    vendorId: "v-1",
    branchByFoodicsId:
      overrides.branchByFoodicsId ??
      new Map([[FOODICS_BRANCH_ID, { id: "branch-local-1" }]]),
  };
}

function orderOf(fixture: unknown): Record<string, unknown> {
  const { order } = extractFoodicsEnvelope(fixture);
  expect(order).not.toBeNull();
  return order as Record<string, unknown>;
}

describe("extractFoodicsEnvelope", () => {
  test("reads event name + payload-wrapped order", () => {
    const { event, order } = extractFoodicsEnvelope(codFixture);
    expect(event).toBe("order.delivery.created");
    expect((order as any).id).toBe("f00d1c50-aaaa-4bbb-8ccc-000000000001");
  });

  test("tolerates a top-level order body (no wrapper)", () => {
    const { order } = extractFoodicsEnvelope({ id: "abc", branch: { id: "b" } });
    expect((order as any).id).toBe("abc");
  });

  test("garbage body → nulls", () => {
    expect(extractFoodicsEnvelope("nope")).toEqual({ event: null, order: null });
    expect(extractFoodicsEnvelope(null)).toEqual({ event: null, order: null });
  });
});

describe("mapFoodicsOrder", () => {
  test("COD fixture with coords → full CreateOrderInput", () => {
    const result = mapFoodicsOrder(orderOf(codFixture), ctx());
    expect(isSkip(result)).toBe(false);
    const input = result as CreateOrderInput;
    expect(input).toMatchObject({
      tenantId: "t-1",
      source: "FOODICS",
      vendorId: "v-1",
      branchId: "branch-local-1",
      paymentMethod: "COD", // empty payments array = cash on delivery
      orderTotalKwd: 5.25,
      customerName: "Abdullah Al-Sabah",
      customerPhone: "+96550001234", // dial_code joined
      foodicsOrderId: "f00d1c50-aaaa-4bbb-8ccc-000000000001",
    });
    expect(input.dropoff).toEqual({ lat: 29.333961, lng: 48.075977 });
    expect(input.dropoffAddress).toContain("Salmiya, Block 4");
    expect((input.metadata as any).foodics.customerNotes).toBe(
      "Ring the bell twice, leave at the door",
    );
    expect((input.metadata as any).foodics.appId).toBe("darb-partner-app");
    expect(input.actor.type).toBe("SYSTEM");
  });

  test("prepaid fixture (payments present) → PREPAID + string coords parsed", () => {
    const result = mapFoodicsOrder(orderOf(prepaidFixture), ctx());
    expect(isSkip(result)).toBe(false);
    const input = result as CreateOrderInput;
    expect(input.paymentMethod).toBe("PREPAID");
    expect(input.orderTotalKwd).toBe(12.75); // "12.750" string tolerated
    expect(input.dropoff).toEqual({ lat: 29.378586, lng: 47.993202 });
    expect(input.customerPhone).toBe("+96555009876"); // already-prefixed phone kept
  });

  test("missing coords STILL MAPS (orderService rejects NO_COORDINATES + persists)", () => {
    const result = mapFoodicsOrder(orderOf(missingCoordsFixture), ctx());
    expect(isSkip(result)).toBe(false);
    const input = result as CreateOrderInput;
    expect(input.dropoff).toEqual({}); // no lat/lng keys at all
    expect(input.dropoffAddress).toContain("Hawally");
    expect(input.paymentMethod).toBe("COD");
    expect(input.foodicsOrderId).toBe("f00d1c50-aaaa-4bbb-8ccc-000000000003");
  });

  test("unknown branch → skip (portal must map the branch first)", () => {
    const result = mapFoodicsOrder(orderOf(codFixture), ctx({ branchByFoodicsId: new Map() }));
    expect(isSkip(result)).toBe(true);
    expect((result as { skip: string }).skip).toBe(`UNKNOWN_BRANCH:${FOODICS_BRANCH_ID}`);
  });

  test("missing order id → skip", () => {
    const order = { ...orderOf(codFixture), id: undefined };
    const result = mapFoodicsOrder(order, ctx());
    expect(result).toEqual({ skip: "MISSING_ORDER_ID" });
  });

  test("missing total_price → skip", () => {
    const order = { ...orderOf(codFixture), total_price: undefined };
    expect(mapFoodicsOrder(order, ctx())).toEqual({ skip: "MISSING_TOTAL_PRICE" });
  });
});

describe("orderHasTag", () => {
  const order = orderOf(codFixture);

  test("matches the Darb tag id from the fixture", () => {
    expect(orderHasTag(order, "7a9d0000-1111-4222-8333-444455556666")).toBe(true);
  });

  test("misses an unrelated tag id / missing tags array", () => {
    expect(orderHasTag(order, "other-tag")).toBe(false);
    expect(orderHasTag({ id: "x" }, "any")).toBe(false);
  });
});

describe("isFoodicsOrderInactive", () => {
  test("active created order is not inactive", () => {
    expect(isFoodicsOrderInactive(orderOf(codFixture))).toBe(false);
  });

  test("void/returned status or cancelled delivery_status is inactive", () => {
    expect(isFoodicsOrderInactive({ status: 4 })).toBe(true);
    expect(isFoodicsOrderInactive({ status: 5 })).toBe(true);
    expect(isFoodicsOrderInactive({ status: 2, delivery_status: 6 })).toBe(true);
    expect(isFoodicsOrderInactive({ status: 2, delivery_status: 3 })).toBe(false);
  });
});
