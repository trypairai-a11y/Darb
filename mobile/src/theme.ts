/**
 * theme.ts — Apple Human Interface Guidelines design tokens for React Native.
 *
 * Light + dark semantic colors, the iOS Dynamic Type ramp, the 4/8-pt spacing
 * grid, corner radii and shadows. Colors are scheme-aware: call `useTheme()` to
 * get the palette `c` and a color-correct type ramp `t` for the current
 * appearance; structural tokens (space/radius/shadow) are scheme-independent.
 */

import { useColorScheme, Platform, type TextStyle, type ViewStyle } from "react-native";

// System font: San Francisco on Apple hardware, graceful fallback elsewhere.
export const fontFamily = Platform.select({
  ios: undefined,
  android: undefined,
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif',
  default: undefined,
}) as string | undefined;

export const lightColors = {
  tint: "#007A3D",
  tintPressed: "#006633",
  tintFill: "rgba(0,122,61,0.12)",

  blue: "#007AFF",
  green: "#34C759",
  greenFill: "rgba(52,199,89,0.15)",
  red: "#FF3B30",
  redFill: "rgba(255,59,48,0.12)",
  orange: "#FF9500",
  orangeFill: "rgba(255,149,0,0.14)",
  yellow: "#FFCC00",
  indigo: "#5856D6",
  purple: "#AF52DE",
  teal: "#30B0C7",

  gray: "#8E8E93",
  gray2: "#AEAEB2",
  gray3: "#C7C7CC",
  gray4: "#D1D1D6",
  gray5: "#E5E5EA",
  gray6: "#F2F2F7",

  label: "#000000",
  secondaryLabel: "rgba(60,60,67,0.6)",
  tertiaryLabel: "rgba(60,60,67,0.3)",
  quaternaryLabel: "rgba(60,60,67,0.18)",
  placeholder: "rgba(60,60,67,0.3)",

  separator: "rgba(60,60,67,0.29)",
  opaqueSeparator: "#C6C6C8",

  systemBackground: "#FFFFFF",
  groupedBackground: "#F2F2F7",
  groupedSecondary: "#FFFFFF",

  systemFill: "rgba(120,120,128,0.2)",
  secondaryFill: "rgba(120,120,128,0.16)",
  tertiaryFill: "rgba(118,118,128,0.12)",
  quaternaryFill: "rgba(116,116,128,0.08)",

  // Accent surface tints used by callout cards (resolve per scheme)
  warnBg: "#FFF8E8",
  warnLabel: "#7A4E00",
  warnLabel2: "#9A6A12",
  successBg: "#ECFDF3",
  successLabel: "#0B5132",
  successLabel2: "#3F8F63",
  unreadBg: "#FBFFFD",

  white: "#FFFFFF",
};

export type Palette = typeof lightColors;

export const darkColors: Palette = {
  tint: "#30D158",
  tintPressed: "#28B84C",
  tintFill: "rgba(48,209,88,0.18)",

  blue: "#0A84FF",
  green: "#30D158",
  greenFill: "rgba(48,209,88,0.18)",
  red: "#FF453A",
  redFill: "rgba(255,69,58,0.18)",
  orange: "#FF9F0A",
  orangeFill: "rgba(255,159,10,0.18)",
  yellow: "#FFD60A",
  indigo: "#5E5CE6",
  purple: "#BF5AF2",
  teal: "#40C8E0",

  gray: "#8E8E93",
  gray2: "#636366",
  gray3: "#48484A",
  gray4: "#3A3A3C",
  gray5: "#2C2C2E",
  gray6: "#1C1C1E",

  label: "#FFFFFF",
  secondaryLabel: "rgba(235,235,245,0.6)",
  tertiaryLabel: "rgba(235,235,245,0.3)",
  quaternaryLabel: "rgba(235,235,245,0.16)",
  placeholder: "rgba(235,235,245,0.3)",

  separator: "rgba(84,84,88,0.6)",
  opaqueSeparator: "#38383A",

  systemBackground: "#000000",
  groupedBackground: "#000000",
  groupedSecondary: "#1C1C1E",

  systemFill: "rgba(120,120,128,0.36)",
  secondaryFill: "rgba(120,120,128,0.32)",
  tertiaryFill: "rgba(118,118,128,0.24)",
  quaternaryFill: "rgba(118,118,128,0.18)",

  warnBg: "rgba(255,159,10,0.16)",
  warnLabel: "#FFD479",
  warnLabel2: "#E0A33A",
  successBg: "rgba(48,209,88,0.16)",
  successLabel: "#7BE3A0",
  successLabel2: "#4FB877",
  unreadBg: "#10240F",

  white: "#FFFFFF",
};

// ─── iOS type ramp (colorless metrics; color injected per scheme below) ───
const t = (o: TextStyle): TextStyle => ({ fontFamily, ...o });

export const type = {
  largeTitle: t({ fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.37 }),
  title1: t({ fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: 0.36 }),
  title2: t({ fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: 0.35 }),
  title3: t({ fontSize: 20, lineHeight: 25, fontWeight: "600", letterSpacing: 0.38 }),
  headline: t({ fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.43 }),
  body: t({ fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.43 }),
  callout: t({ fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.31 }),
  subheadline: t({ fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.24 }),
  footnote: t({ fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.08 }),
  caption1: t({ fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0 }),
  caption2: t({ fontSize: 11, lineHeight: 13, fontWeight: "400", letterSpacing: 0.07 }),
};

export type TypeRamp = typeof type;

// Pre-build color-correct ramps so the hook returns stable references.
const withColor = (label: string): TypeRamp => {
  const out: Record<string, TextStyle> = {};
  for (const k of Object.keys(type)) out[k] = { ...(type as any)[k], color: label };
  return out as TypeRamp;
};
const lightType = withColor(lightColors.label);
const darkType = withColor(darkColors.label);

// ─── Spacing (8-pt grid, 4-pt steps) ───
export const space = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 };

// ─── Continuous (squircle) radii ───
export const radius = { sm: 8, field: 10, button: 12, card: 16, sheet: 20, capsule: 999 };
export const continuous = { borderCurve: "continuous" as const };

// ─── Soft HIG shadows ───
export const shadow: Record<"card" | "floating", ViewStyle> = {
  card: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  floating: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

// ─── The hook every component/screen uses ───
export function useTheme(): { c: Palette; t: TypeRamp; dark: boolean } {
  const dark = useColorScheme() === "dark";
  return { c: dark ? darkColors : lightColors, t: dark ? darkType : lightType, dark };
}

// Static light palette for non-render contexts (kept for back-compat).
export const colors = lightColors;
