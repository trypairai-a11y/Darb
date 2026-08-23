/**
 * driverNav.affordances.test.tsx — the controls the 2026-08-04 client note moved.
 *
 * This suite exists for one bug class and no other: a control that is missing
 * from the state the driver is actually looking at. Rider support and Darb
 * Points were on Home; the client asked for them in Settings and, for support,
 * on the order screen as well. A move like that fails silently, because the code
 * still compiles and the old screen still renders, so the only thing that proves
 * it is rendering each screen and looking for the row.
 *
 * Titles are translated strings and would make this suite fail on a copy edit,
 * so every assertion is on a testID.
 */

import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => {
  // Required inside the factory: jest hoists jest.mock above the imports, so a
  // module-scope `React` is not initialised yet when this runs.
  const mockReact = require("react");
  const { View: MockView } = require("react-native");

  // Tabs stands in for the real navigator so the layout can be rendered without
  // one. Each declared screen becomes a marker carrying its name and whether it
  // is on the bar, which is exactly what the client's note is about.
  const MockTabs = ({ children }: any) => mockReact.createElement(MockView, null, children);
  MockTabs.Screen = ({ name, options }: any) =>
    mockReact.createElement(MockView, {
      testID: `tabscreen:${name}:${options?.href === null ? "off" : "on"}`,
    });

  return {
    Tabs: MockTabs,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => mockReact.useEffect(cb, []),
    useLocalSearchParams: () => ({}),
    Link: ({ children }: any) => children,
  };
});

jest.mock("react-native-safe-area-context", () => {
  const mockReact = require("react");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: ({ children }: any) =>
      mockReact.createElement(require("react-native").View, null, children),
  };
});

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationHandler: jest.fn(),
}));

jest.mock("expo-device", () => ({ modelName: "iPhone 15" }));

import SettingsScreen from "../app/(tabs)/settings";
import HomeScreen from "../app/(tabs)/home";
import TabLayout from "../app/(tabs)/_layout";

describe("the bottom bar is exactly four tabs", () => {
  /** Declared screens in tree order, as `name:on` or `name:off` the bar. */
  function declaredScreens(): string[] {
    render(<TabLayout />);
    return screen
      .getAllByTestId(/^tabscreen:/)
      .map((n) => String(n.props.testID).replace("tabscreen:", ""));
  }

  it("shows Home, Wallet, Shifts, Settings in that order", () => {
    // The order is the client's, not alphabetical: a driver opens Wallet far
    // more often than Shifts, so it sits next to Home.
    const onBar = declaredScreens().filter((s) => s.endsWith(":on")).map((s) => s.split(":")[0]);
    expect(onBar).toEqual(["home", "wallet", "shifts", "settings"]);
  });

  it("keeps alerts and history routable but off the bar", () => {
    // Off the bar is not deleted. A push notification deep-links to /alerts and
    // has to land on something.
    const off = declaredScreens().filter((s) => s.endsWith(":off")).map((s) => s.split(":")[0]).sort();
    expect(off).toEqual(["alerts", "history"]);
  });
});

describe("Settings carries what came off Home", () => {
  it("shows Darb Points, Notifications and Rider support", async () => {
    render(<SettingsScreen />);

    // Points was already here before the note. Notifications and support were
    // not, and are the half of the request that needed building.
    await waitFor(() => expect(screen.getByTestId("settings-my-points")).toBeTruthy());
    expect(screen.getByTestId("settings-notifications")).toBeTruthy();
    expect(screen.getByTestId("settings-rider-support")).toBeTruthy();
  });
});

describe("Home is the status toggle and the heat map", () => {
  it("renders the demand heat map", async () => {
    render(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId("home-demand-heatmap")).toBeTruthy());
  });

  it("no longer carries the rows that moved to Settings", async () => {
    render(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId("home-demand-heatmap")).toBeTruthy());

    // Their absence here is half the request. If either comes back, a driver has
    // two doors onto the same screen again.
    expect(screen.queryByTestId("home-rider-support")).toBeNull();
    expect(screen.queryByTestId("home-cash-on-hand")).toBeNull();
  });

  it("keeps the location warning when the grant is missing", async () => {
    const Location = require("expo-location");
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: "denied", granted: false });
    Location.getBackgroundPermissionsAsync.mockResolvedValue({ status: "denied", granted: false });

    render(<HomeScreen />);

    // The row is conditional now. It is also the only thing on screen that
    // explains why Online will refuse, so it has to survive the simplification.
    await waitFor(() => expect(screen.getByTestId("home-location-warning")).toBeTruthy());
  });
});
