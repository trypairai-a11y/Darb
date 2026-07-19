/**
 * navLinks — deep-link URL construction per platform (pure function).
 */

import { availableNavApps, buildNavLink } from "../src/services/navLinks";

const target = { lat: 29.3759, lng: 47.9774 };

describe("buildNavLink", () => {
  test("google on android uses the turn-by-turn intent scheme", () => {
    const link = buildNavLink("google", target, "android");
    expect(link.primary).toBe("google.navigation:q=29.3759,47.9774");
    expect(link.fallback).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=29.3759,47.9774&travelmode=driving",
    );
  });

  test("google on ios uses comgooglemaps:// with driving mode", () => {
    const link = buildNavLink("google", target, "ios");
    expect(link.primary).toBe("comgooglemaps://?daddr=29.3759,47.9774&directionsmode=driving");
    expect(link.fallback).toContain("https://www.google.com/maps/dir/");
  });

  test("waze is identical on both platforms", () => {
    for (const platform of ["ios", "android"] as const) {
      const link = buildNavLink("waze", target, platform);
      expect(link.primary).toBe("waze://?ll=29.3759,47.9774&navigate=yes");
      expect(link.fallback).toBe("https://waze.com/ul?ll=29.3759,47.9774&navigate=yes");
    }
  });

  test("apple maps uses maps:// with driving flag", () => {
    const link = buildNavLink("apple", target, "ios");
    expect(link.primary).toBe("maps://?daddr=29.3759,47.9774&dirflg=d");
    expect(link.fallback).toBe("https://maps.apple.com/?daddr=29.3759,47.9774&dirflg=d");
  });
});

describe("availableNavApps", () => {
  test("iOS offers all three, Android skips Apple Maps", () => {
    expect(availableNavApps("ios")).toEqual(["google", "waze", "apple"]);
    expect(availableNavApps("android")).toEqual(["google", "waze"]);
  });
});
