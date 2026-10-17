// Client note (Osama, 15 Oct 2026): "for the order map must show the route the
// driver took and the store + customer location, must be able to copy the
// link". The map always states what it has (pins, route, or that no route was
// recorded yet) and offers copyable Google Maps and tracking links.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderRoute } from "@/types/darb";

const toast = { success: vi.fn(), error: vi.fn() };
const routeFn = vi.fn();
const vendorRouteFn = vi.fn();

vi.mock("@/lib/darbApi", () => ({
  deliveryOrdersApi: { route: (id: string) => routeFn(id) },
  vendorApi: { orderRoute: (id: string) => vendorRouteFn(id) },
}));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/components/shared/Toast", () => ({ useToast: () => toast }));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="order-route-map-inner-stub" />,
}));

import OrderRouteMap from "@/components/map/OrderRouteMap";
import { googleMapsDirectionsUrl, googleMapsPlaceUrl } from "@/lib/mapLinks";

const route: OrderRoute = {
  orderId: "o-1",
  status: "DELIVERED",
  driver: { id: "d-1", name: "Qadir" },
  pickup: { lat: 29.33, lng: 48.07, name: "Burger Boulevard · Salmiya", address: null },
  dropoff: { lat: 29.3, lng: 48.0, address: "Block 1" },
  window: null,
  path: [],
  thinned: false,
};

function renderMap(props: Partial<React.ComponentProps<typeof OrderRouteMap>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderRouteMap orderId="o-1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  routeFn.mockReset();
  vendorRouteFn.mockReset();
});

describe("map links", () => {
  it("builds a Google Maps pin link and a store to customer directions link", () => {
    expect(googleMapsPlaceUrl({ lat: 29.33, lng: 48.07 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=29.33,48.07",
    );
    expect(googleMapsDirectionsUrl({ lat: 29.33, lng: 48.07 }, { lat: 29.3, lng: 48 })).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=29.33,48.07&destination=29.3,48",
    );
  });
});

describe("<OrderRouteMap/>", () => {
  it("shows both pins and says no driver route was recorded when the path is empty", async () => {
    routeFn.mockResolvedValue(route);
    renderMap();
    expect(await screen.findByTestId("order-route-map-inner-stub")).toBeInTheDocument();
    expect(screen.getByText("orderMap.noRoute")).toBeInTheDocument();
    expect(screen.getByText("orderMap.store")).toBeInTheDocument();
    expect(screen.getByText("orderMap.customer")).toBeInTheDocument();
  });

  it("draws the driver route legend when GPS was recorded", async () => {
    routeFn.mockResolvedValue({
      ...route,
      path: [
        { lat: 29.31, lng: 48.01, at: "2026-10-14T10:05:00Z", leg: "TO_PICKUP" },
        { lat: 29.32, lng: 48.02, at: "2026-10-14T10:15:00Z", leg: "TO_DROPOFF" },
      ],
    });
    renderMap();
    expect(await screen.findByText("orderMap.driverRoute: orderMap.toCustomer")).toBeInTheDocument();
    expect(screen.queryByText("orderMap.noRoute")).toBeNull();
  });

  it("copies the store, customer, route and tracking links", async () => {
    routeFn.mockResolvedValue(route);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderMap({ trackingUrl: "https://track.example/t/abc" });

    fireEvent.click(await screen.findByTestId("order-route-copy-route"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://www.google.com/maps/dir/?api=1&origin=29.33,48.07&destination=29.3,48",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("orderMap.copied");

    fireEvent.click(screen.getByTestId("order-route-copy-store"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(googleMapsPlaceUrl(route.pickup!)));
    fireEvent.click(screen.getByTestId("order-route-copy-customer"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(googleMapsPlaceUrl(route.dropoff!)));
    fireEvent.click(screen.getByTestId("order-route-copy-tracking"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("https://track.example/t/abc"));
  });

  it("falls back to a manual copy box when the clipboard is unavailable", async () => {
    routeFn.mockResolvedValue(route);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    renderMap();

    fireEvent.click(await screen.findByTestId("order-route-copy-customer"));
    await waitFor(() => expect(prompt).toHaveBeenCalledWith("orderMap.copyPrompt", googleMapsPlaceUrl(route.dropoff!)));
    expect(toast.error).toHaveBeenCalledWith("orderMap.copyFailed");
    prompt.mockRestore();
  });

  it("says so instead of vanishing when the route cannot be loaded", async () => {
    routeFn.mockRejectedValue(new Error("500"));
    renderMap();
    // The component retries once (about a second) before it gives up.
    expect(await screen.findByText("orderMap.loadFailed", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("reads the vendor-scoped endpoint on the merchant's screen", async () => {
    vendorRouteFn.mockResolvedValue(route);
    renderMap({ scope: "vendor" });
    expect(await screen.findByTestId("order-route-map-inner-stub")).toBeInTheDocument();
    expect(vendorRouteFn).toHaveBeenCalledWith("o-1");
    expect(routeFn).not.toHaveBeenCalled();
  });
});
