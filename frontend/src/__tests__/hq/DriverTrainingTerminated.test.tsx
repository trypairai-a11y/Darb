// Client note of 2026-10-05: "I terminated this driver, must show that the
// driver is terminated". The training panel showed only the window's verdict
// (Did not pass), so a terminated driver read exactly like one still waiting.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const driver = { id: "d1", name: "Abdul Rahman", driverCode: null, phone: null, status: "TERMINATED", inTraining: false };
const failed = {
  id: "s1",
  status: "FAILED",
  periodDays: 1,
  startsAt: "2026-09-22T17:00:00Z",
  endsAt: "2026-09-23T17:00:00Z",
  startedAt: null,
  completedAt: "2026-09-23T17:00:00Z",
  reason: null,
  outcomeNote: null,
  scorecard: null,
  driver,
  coach: null,
};

const list = vi.fn(async (_params?: Record<string, unknown>) => ({ data: [failed] }));

vi.mock("@/lib/darbApi", () => ({
  driverTrainingApi: {
    list: (params?: Record<string, unknown>) => list(params),
    detail: async () => ({ ...failed, orders: [] }),
    pickupPoints: async () => ({ data: [] }),
  },
  driverTrackingApi: { setState: vi.fn() },
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ hasRole: () => true }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import DriverTrainingTab from "@/components/hq/DriverTrainingTab";

describe("Driver training, terminated driver", () => {
  it("asks the server only for windows that still need the coach", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DriverTrainingTab />
      </QueryClientProvider>,
    );
    await screen.findAllByText("Abdul Rahman");
    expect(list).toHaveBeenCalledWith({ view: "needs-action" });
  });

  it("shows Terminated beside Did not pass, and offers no retrain or terminate", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DriverTrainingTab />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("training-driver-terminated")).toHaveTextContent("driverTracking.stateTerminated");
    expect(screen.queryByTestId("training-failed-next")).toBeNull();
  });
});
