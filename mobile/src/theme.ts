/**
 * theme.ts — the driver app on Darb's design system.
 *
 * The same palette the web platform runs, token for token: sand surfaces,
 * brand navy for primary, the yellow dot as the accent, and Darb's own
 * semantic colours (moss for success, clay for warning). The type is the
 * platform stack, not two downloaded families that appear nowhere else.
 *
 * This screen used to be a dark, lime-accented system of its own. It is one
 * product, so it is one look.
 *
 * Components/screens consume `useTheme()` -> { c (palette), t (type ramp) }.
 */

import { type TextStyle, type ViewStyle } from "react-native";

// ─── Type families (loaded at the root via expo-font / @expo-google-fonts) ───
/**
 * The web platform's stack: SF Pro on Apple, the system UI face elsewhere,
 * Almarai for Arabic. Undefined means "the platform's own", which is exactly
 * what `font-sans` resolves to in the web app, and it removes two font
 * downloads from a screen a courier opens on mobile data.
 */
export const fonts = {
  display: undefined as string | undefined,
  displayX: undefined as string | undefined,
  bodyMedium: undefined as string | undefined,
  bodySemibold: undefined as string | undefined,
  bodyBold: undefined as string | undefined,
  bodyX: undefined as string | undefined,
};
// Kept for any legacy reference.
export const fontFamily = fonts.bodyMedium;

const C = {
  // Signature accent — Darb yellow, the dot in the wordmark.
  tint: "#F5C518",
  tintPressed: "#DCB015",
  tintFill: "rgba(245,197,24,0.16)",
  onTint: "#0A1220",

  // Brand navy: the web's `primary`.
  navy: "#1D4E89",
  navyPressed: "#163C6E",
  navyFill: "rgba(29,78,137,0.10)",
  onNavy: "#FFFFFF",

  // Semantic accents, taken from the web's tokens rather than invented.
  blue: "#3860BE",
  green: "#468254",
  greenFill: "rgba(70,130,84,0.12)",
  red: "#C0392B",
  redFill: "rgba(192,57,43,0.10)",
  orange: "#C57B59",
  orangeFill: "rgba(197,123,89,0.12)",
  yellow: "#F5C518",
  indigo: "#27455C",
  purple: "#7D5BA6",
  teal: "#2F8F83",

  // Neutral ramp — the web's sand scale.
  gray: "#8A7E72",
  gray2: "#A99E92",
  gray3: "#C5BBB1",
  gray4: "#E4E0DC",
  gray5: "#EDEAE5",
  gray6: "#F6F5F3",

  // Text
  label: "#302E2D",
  secondaryLabel: "rgba(48,46,45,0.66)",
  tertiaryLabel: "rgba(48,46,45,0.44)",
  quaternaryLabel: "rgba(48,46,45,0.24)",
  placeholder: "rgba(48,46,45,0.40)",

  // Structure
  separator: "rgba(48,46,45,0.10)",
  opaqueSeparator: "#E4E0DC",
  hairline: "rgba(48,46,45,0.08)",

  // Backgrounds / surfaces — sand-50 canvas, white cards, as on the web.
  systemBackground: "#FBFAF8",
  groupedBackground: "#F6F5F3",
  groupedSecondary: "#FFFFFF",
  surfaceElevated: "#FFFFFF",

  // The web's sand gradient.
  bgTop: "#F6F5F3",
  bgBottom: "#EDEAE5",
  glow: "rgba(245,197,24,0.18)",

  // Fills
  systemFill: "rgba(48,46,45,0.10)",
  secondaryFill: "rgba(48,46,45,0.07)",
  tertiaryFill: "rgba(48,46,45,0.05)",
  quaternaryFill: "rgba(48,46,45,0.03)",

  // Semantic callout surfaces
  warnBg: "rgba(197,123,89,0.12)",
  warnLabel: "#8A4A2C",
  warnLabel2: "#C57B59",
  successBg: "rgba(70,130,84,0.12)",
  successLabel: "#2F5D3B",
  successLabel2: "#468254",
  unreadBg: "rgba(245,197,24,0.08)",

  white: "#FFFFFF",
};

export type Palette = typeof C;
export const lightColors = C;
export const darkColors = C;
export const colors = C;

// ─── Type ramp — families encode weight (don't combine with fontWeight) ───
const t = (o: TextStyle): TextStyle => o;
export const type = {
  hero: t({ fontFamily: fonts.displayX, fontSize: 48, lineHeight: 50, letterSpacing: -1.4 }),
  largeTitle: t({ fontFamily: fonts.display, fontSize: 33, lineHeight: 38, letterSpacing: -0.6 }),
  title1: t({ fontFamily: fonts.display, fontSize: 27, lineHeight: 32, letterSpacing: -0.5 }),
  title2: t({ fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 }),
  title3: t({ fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 }),
  headline: t({ fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }),
  body: t({ fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 }),
  callout: t({ fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 }),
  subheadline: t({ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 }),
  footnote: t({ fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 }),
  caption1: t({ fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 16 }),
  caption2: t({ fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 }),
};
export type TypeRamp = typeof type;

const withColor = (label: string): TypeRamp => {
  const out: Record<string, TextStyle> = {};
  for (const k of Object.keys(type)) out[k] = { ...(type as any)[k], color: label };
  return out as TypeRamp;
};
const themedType = withColor(C.label);

// ─── Spacing (8-pt grid) ───
export const space = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 };

// ─── Radii (generous, continuous) ───
export const radius = { sm: 10, field: 14, button: 16, card: 22, sheet: 28, capsule: 999 };
export const continuous = { borderCurve: "continuous" as const };

// ─── Shadows (depth comes from hairline borders; glow for accent moments) ───
export const shadow: Record<"card" | "floating" | "glow", ViewStyle> = {
  card: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  floating: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  glow: { shadowColor: "#F5C518", shadowOpacity: 0.30, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

export function useTheme(): { c: Palette; t: TypeRamp; dark: boolean } {
  return { c: C, t: themedType, dark: true };
}
