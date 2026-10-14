// Revision 24 #6: "I need a checkbox to select multiple drivers to take
// action". Select rows, pick a verb, confirm, and the drivers it could not be
// applied to are listed with the reason instead of failing the batch.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function row(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    driverCode: null,
    phone: null,
    status: "ACTIVE",
    isFrozen: false,
    inTraining: false,
    complianceFreezeReason: null,
    vehicleType: null,
    fleetPartnerId: null,
    fleetPartnerName: null,
    assignedZoneId: null,
    assignedZoneName: null,
    availability: "OFFLINE",
    lastSeenAt: null,
    delivered: 0,
    failed: 0,
    onTimeRate: null,
    acceptanceRate: null,
    rating: null,
    rejections: 0,
    declined: 0,
    violations: 0,
    violationsOpen: 0,
    docsValid: 0,
    docsRequired: 8,
    trainingSessionId: null,
    trainingEndsAt: null,
    terminationPending: false,
    ...extra,
  };
}

const bulkSetState = vi.fn();

vi.mock("@/lib/darbApi", () => ({
  driverTrackingApi: {
    list: async () => ({
      rows: [
        row("d1", "Anil"),
        row("d2", "Badr"),
        row("d3", "Abdul Rahman", { status: "TERMINATED", terminationPending: true }),
      ],
      windowDays: 30,
    }),
    setState: vi.fn(),
    bulkSetState: (body: unknown) => bulkSetState(body),
  },
  driverTrainingApi: { create: vi.fn(), complete: vi.fn() },
  fleetsApi: { list: async () => ({ data: [] }) },
  zonesApi: { list: async () => ({ data: [] }) },
  unwrapList: (d: { data?: unknown[] } | unknown[]) => (Array.isArray(d) ? d : d?.data ?? []),
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ hasRole: () => true }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import DriverTrackingTab from "@/components/hq/DriverTrackingTab";

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DriverTrackingTab />
    </QueryClientProvider>,
  );
}

describe("Driver tracking bulk actions", () => {
  beforeEach(() => bulkSetState.mockReset());

  it("shows no bulk bar until a row is ticked, and select all ticks every visible row", async () => {
    renderTab();
    await screen.findByText("Anil");
    expect(screen.queryByTestId("driver-bulk-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("driver-select-all"));
    const boxes = screen.getAllByTestId("driver-select") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(screen.getByTestId("driver-bulk-bar")).toBeInTheDocument();
  });

  it("applies the verb to the selected drivers and lists the refusals", async () => {
    bulkSetState.mockResolvedValue({
      action: "SUSPEND",
      succeeded: 1,
      failed: 1,
      results: [
        { driverId: "d1", name: "Anil", ok: true },
        { driverId: "d2", name: "Badr", ok: false, error: "That driver is in training.", code: "IN_TRAINING" },
      ],
    });
    renderTab();
    await screen.findByText("Anil");
    // Rows sort by name: Abdul Rahman, Anil, Badr.
    const boxes = screen.getAllByTestId("driver-select");
    fireEvent.click(boxes[1]!);
    fireEvent.click(boxes[2]!);

    fireEvent.click(screen.getByTestId("driver-bulk-suspend"));
    // ConfirmModal's confirm button carries the verb's label.
    const confirm = await screen.findAllByRole("button", { name: "driverTracking.suspend" });
    fireEvent.click(confirm[confirm.length - 1]!);

    await vi.waitFor(() =>
      expect(bulkSetState).toHaveBeenCalledWith({ driverIds: ["d1", "d2"], action: "SUSPEND" }),
    );
    const results = await screen.findByTestId("driver-bulk-results");
    expect(within(results).getByText("Badr")).toBeInTheDocument();
    expect(within(results).getByText("driverTracking.inTrainingBlocked")).toBeInTheDocument();
  });

  it("badges a terminated driver whose equipment is not cleared", async () => {
    renderTab();
    await screen.findByText("Anil");
    // Terminated rows are listed only when the server sends them; the badge
    // is what matters here.
    expect(screen.getByText(/rev24Ops\.pendingClearance/)).toBeInTheDocument();
  });
});
