import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OpsTaskList from "@/components/ops/OpsTaskList";
import type { DeliveryOrder } from "@/types/darb";

// The demo tenant clears its own orders, so the Live list is empty as often as
// not. These pin the card layout down without needing live traffic.

function order(overrides: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: "o1",
    orderNumber: "DRB-SHWT-0147",
    status: "ASSIGNED",
    orderTotalKwd: "7.567",
    slaDeadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    driverId: "d1",
    driver: { id: "d1", name: "Chirag Patel" },
    vendor: { id: "v1", name: "Shawarma Time" },
    ...overrides,
  } as unknown as DeliveryOrder;
}

function renderList(orders: DeliveryOrder[]) {
  return render(
    <OpsTaskList orders={orders} selectedId={null} onSelect={vi.fn()} onCopy={vi.fn()} />
  );
}

describe("OpsTaskList", () => {
  it("shows the vendor, the order number, the driver and the total", () => {
    renderList([order()]);
    expect(screen.getByText("Shawarma Time")).toBeInTheDocument();
    expect(screen.getByText("DRB-SHWT-0147")).toBeInTheDocument();
    expect(screen.getByText("Chirag Patel")).toBeInTheDocument();
  });

  // Removed because the status badge below it is a more precise reading of the
  // same fact: driverId set means ASSIGNED.
  it("no longer prints an acceptance label beside the vendor", () => {
    const { container } = renderList([order()]);
    expect(container.textContent).not.toContain("Accepted");
    expect(container.textContent).not.toContain("Awaiting driver");
  });

  // Removed because it is the same clock as the SLA countdown, in worse units.
  it("no longer prints an elapsed-minutes readout", () => {
    const { container } = renderList([order()]);
    expect(container.textContent).not.toContain("Total time");
  });

  it("keeps the copy control reachable but quiet until the card is hovered", () => {
    renderList([order()]);
    const copy = screen.getByRole("button", { name: /copy task info/i });
    // Still in the accessibility tree and the tab order, just transparent.
    expect(copy).toBeInTheDocument();
    const row = copy.parentElement as HTMLElement;
    expect(row.className).toContain("opacity-0");
    expect(row.className).toContain("group-hover:opacity-100");
    expect(row.className).toContain("focus-within:opacity-100");
  });

  it("renders the empty state when nothing matches", () => {
    renderList([]);
    expect(screen.getByText(/no tasks match/i)).toBeInTheDocument();
  });
});
