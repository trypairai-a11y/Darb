/**
 * theme.ts — "Darb Velocity" design system.
 *
 * A premium dark motion-telemetry aesthetic for couriers: a near-black canvas
 * with atmosphere, an electric-lime signature accent, expressive Bricolage
 * Grotesque display type over Manrope body, hairline-bordered surfaces and
 * glowing accents. One confident direction — dark by design.
 *
 * Components/screens consume `useTheme()` → { c (palette), t (type ramp) }.
 */

import { type TextStyle, type ViewStyle } from "react-native";

// ─── Type families (loaded at the root via expo-font / @expo-google-fonts) ───
export const fonts = {
  display: "BricolageGrotesque_700Bold",
  displayX: "BricolageGrotesque_800ExtraBold",
  bodyMedium: "Manrope_500Medium",
  bodySemibold: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
  bodyX: "Manrope_800ExtraBold",
};
// Kept for any legacy reference.
export const fontFamily = fonts.bodyMedium;

const C = {
  // Signature accent — electric lime (speed / earnings / "live")
  tint: "#C6FF3A",
  tintPressed: "#B4F525",
  tintFill: "rgba(198,255,58,0.14)",
  onTint: "#0B0E05", // near-black text on the lime accent

  // System accents (dark-tuned)
  blue: "#5AC8FA",
  green: "#39E08A",
  greenFill: "rgba(57,224,138,0.14)",
  red: "#FF5C52",
  redFill: "rgba(255,92,82,0.15)",
  orange: "#FFB84D",
  orangeFill: "rgba(255,184,77,0.14)",
  yellow: "#FFD60A",
  indigo: "#7D7BFF",
  purple: "#CB8CFF",
  teal: "#5FE3D0",

  // Neutral ramp on dark
  gray: "#8A8F98",
  gray2: "#6B7079",
  gray3: "#454A52",
  gray4: "#33373E",
  gray5: "#23262C",
  gray6: "#15171B",

  // Text
  label: "#F3F5F8",
  secondaryLabel: "rgba(235,240,250,0.62)",
  tertiaryLabel: "rgba(235,240,250,0.34)",
  quaternaryLabel: "rgba(235,240,250,0.18)",
  placeholder: "rgba(235,240,250,0.34)",

  // Structure
  separator: "rgba(255,255,255,0.08)",
  opaqueSeparator: "#23262C",
  hairline: "rgba(255,255,255,0.07)",

  // Backgrounds / surfaces
  systemBackground: "#0A0B0D",
  groupedBackground: "#0A0B0D",
  groupedSecondary: "#15171B",
  surfaceElevated: "#1B1E24",

  // Atmosphere gradient stops + accent glow
  bgTop: "#13161B",
  bgBottom: "#08090B",
  glow: "rgba(198,255,58,0.16)",

  // Fills
  systemFill: "rgba(255,255,255,0.12)",
  secondaryFill: "rgba(255,255,255,0.09)",
  tertiaryFill: "rgba(255,255,255,0.06)",
  quaternaryFill: "rgba(255,255,255,0.04)",

  // Semantic callout surfaces
  warnBg: "rgba(255,184,77,0.12)",
  warnLabel: "#FFCE85",
  warnLabel2: "#E0A33A",
  successBg: "rgba(57,224,138,0.12)",
  successLabel: "#8DEFB6",
  successLabel2: "#4FB877",
  unreadBg: "rgba(198,255,58,0.05)",

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
  glow: { shadowColor: "#C6FF3A", shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

export function useTheme(): { c: Palette; t: TypeRamp; dark: boolean } {
  return { c: C, t: themedType, dark: true };
}
