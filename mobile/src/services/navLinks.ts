/**
 * navLinks.ts — turn-by-turn deep links into Google Maps / Waze / Apple Maps.
 *
 * URL construction is a pure function (unit-tested); opening goes through
 * Linking.canOpenURL(primary) with an https fallback so a phone without the
 * app installed still lands on the web/store flow.
 *
 * iOS requires the custom schemes to be declared in
 * app.json → ios.infoPlist.LSApplicationQueriesSchemes: ["comgooglemaps","waze"]
 * or canOpenURL always returns false.
 */

import { Linking, Platform } from "react-native";

export type NavApp = "google" | "waze" | "apple";

export interface NavTarget {
  lat: number;
  lng: number;
  label?: string;
}

export interface NavLink {
  primary: string;
  fallback: string;
}

export function buildNavLink(
  app: NavApp,
  target: NavTarget,
  platform: "ios" | "android" | string = Platform.OS,
): NavLink {
  const ll = `${target.lat},${target.lng}`;
  switch (app) {
    case "google": {
      const fallback = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
      if (platform === "android") {
        // Launches Google Maps turn-by-turn directly.
        return { primary: `google.navigation:q=${ll}`, fallback };
      }
      return { primary: `comgooglemaps://?daddr=${ll}&directionsmode=driving`, fallback };
    }
    case "waze":
      return {
        primary: `waze://?ll=${ll}&navigate=yes`,
        fallback: `https://waze.com/ul?ll=${ll}&navigate=yes`,
      };
    case "apple":
      return {
        primary: `maps://?daddr=${ll}&dirflg=d`,
        fallback: `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
      };
  }
}

/** Which nav apps to offer on this platform (Apple Maps is iOS-only). */
export function availableNavApps(platform: string = Platform.OS): NavApp[] {
  return platform === "ios" ? ["google", "waze", "apple"] : ["google", "waze"];
}

export async function openNav(app: NavApp, target: NavTarget): Promise<void> {
  const { primary, fallback } = buildNavLink(app, target);
  try {
    const canOpen = await Linking.canOpenURL(primary);
    await Linking.openURL(canOpen ? primary : fallback);
  } catch {
    await Linking.openURL(fallback).catch(() => {});
  }
}
