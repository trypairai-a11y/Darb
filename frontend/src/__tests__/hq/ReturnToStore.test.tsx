// Client notes of 2026-09-21 / 2026-09-23 / 2026-10-05: "the driver must return
// the order to the vendor, after that he can report that the delivery failed"
// and "still it is not showing that the order has been returned to store".
// The order now keeps its in-flight status while it travels back (the server
// stamps metadata.returnStartedAt), so the staff panel must say so, offer the
// Return to store backstop on it, and stop offering actions that can only 409.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DeliveryOrder } from "@/types/darb";

vi.mock("@/lib/darbApi", () => ({
  deliveryOrdersApi: {
    getById: () => new Promise(() => {}), // the fallback row is what renders
    timeline: async () => [],
    candidates: async () => [],
  },
  unwrapList: (x: unknown) => (Array.isArray(x) ? x : []),
}));
vi.mock("@/lib/driverPositionStore", () => ({ useDriverPositions: () => [] }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import OrderOpsPanel from "@/components/darb/OrderOpsPanel";
import { isReturningToStore } from "@/lib/orderReturn";

const base = {
  id: "ord-1",
  orderNumber: "DRB-BRGB-000001",
  vendorId: "v-1",
  driverId: "drv-1",
  status: "PICKED_UP",
  metadata: null,
} as unknown as DeliveryOrder;

function renderPanel(order: DeliveryOrder) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderOpsPanel orderId={order.id} onClose={() => {}} fallback={order} canEdit />
    </QueryClientProvider>,
  );
}

describe("isReturningToStore", () => {
  it("is true only for an in-flight order whose return leg started", () => {
    expect(isReturningToStore(base)).toBe(false);
    expect(isReturningToStore({ ...base, metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } })).toBe(true);
    expect(
      isReturningToStore({ ...base, status: "RETURNED", metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } }),
    ).toBe(false);
  });
});

describe("Ops order panel, return to store", () => {
  it("an order on its way back says so and offers Return to store, not cancel", () => {
    renderPanel({ ...base, metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } } as DeliveryOrder);
    expect(screen.getByTestId("order-returning-pill")).toHaveTextContent("dispatch.returningToStore");
    expect(screen.getByTestId("order-return-button")).toBeInTheDocument();
    expect(screen.queryByText("dispatch.cancelOrder")).toBeNull();
  });

  it("a FAILED order offers Return to store and none of the actions the state machine refuses", () => {
    renderPanel({ ...base, status: "FAILED" } as DeliveryOrder);
    expect(screen.getByTestId("order-return-button")).toBeInTheDocument();
    expect(screen.queryByText("dispatch.cancelOrder")).toBeNull();
    expect(screen.queryByText("dispatch.redispatch")).toBeNull();
  });

  it("a RETURNED order is finished: no actions at all", () => {
    renderPanel({ ...base, status: "RETURNED" } as DeliveryOrder);
    expect(screen.queryByTestId("order-return-button")).toBeNull();
    expect(screen.queryByText("dispatch.cancelOrder")).toBeNull();
  });

  it("an ordinary picked-up order keeps its actions and has no return button", () => {
    renderPanel(base);
    expect(screen.getByText("dispatch.cancelOrder")).toBeInTheDocument();
    expect(screen.queryByTestId("order-return-button")).toBeNull();
    expect(screen.queryByTestId("order-returning-pill")).toBeNull();
  });
});
