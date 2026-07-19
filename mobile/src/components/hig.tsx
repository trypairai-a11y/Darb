/**
 * hig.tsx — reusable Apple HIG building blocks for React Native (light + dark).
 *
 * Inset-grouped lists, cards, nav bars, capsule buttons and segmented controls,
 * all scheme-aware via `useTheme()` from `theme.ts`.
 */

import React, { Children, isValidElement, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  type ViewStyle, type StyleProp,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  useTheme, type Palette, space, radius, continuous, shadow, hitSlop,
} from "../theme";

// ─── Screen container — atmospheric gradient canvas + top safe-area inset ───
export function Screen({ children, style, edges = ["top"] }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; edges?: Edge[] }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.systemBackground }}>
      <LinearGradient colors={[c.bgTop, c.bgBottom]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>{children}</SafeAreaView>
    </View>
  );
}

// ─── Large-title heading ───
export function LargeTitle({ title, subtitle, accessory }: { title: string; subtitle?: string; accessory?: React.ReactNode }) {
  const { c, t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingTop: space.sm, paddingBottom: space.base }}>
      <View style={{ flex: 1 }}>
        <Text style={t.largeTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {accessory}
    </View>
  );
}

// ─── Stack nav bar with back chevron ───
export function NavBar({ title, trailing, onBack }: { title?: string; trailing?: React.ReactNode; onBack?: () => void }) {
  const router = useRouter();
  const { c, t } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.navBar}>
      <TouchableOpacity style={s.navBack} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Back" onPress={onBack ?? (() => router.back())}>
        <ChevronLeft size={26} color={c.tint} />
        <Text style={[t.body, { color: c.tint, marginLeft: -4 }]}>Back</Text>
      </TouchableOpacity>
      {title ? <Text style={[t.headline, { flex: 1, textAlign: "center" }]} numberOfLines={1}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={s.navTrailing}>{trailing}</View>
    </View>
  );
}

// ─── Card ───
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base, borderWidth: 1, borderColor: c.hairline, ...continuous, ...shadow.card }, style]}>
      {children}
    </View>
  );
}

// ─── Section header label ───
export function SectionHeader({ children }: { children: React.ReactNode }) {
  const { c, t } = useTheme();
  return (
    <Text style={[t.footnote, { color: c.secondaryLabel, marginLeft: space.base, marginBottom: 7, marginTop: space.lg }]}>
      {typeof children === "string" ? children.toUpperCase() : children}
    </Text>
  );
}

// ─── Inset-grouped list ───
export function ListGroup({ children, header, footer, style }: { children: React.ReactNode; header?: string; footer?: string; style?: StyleProp<ViewStyle> }) {
  const { c, t } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {header ? <SectionHeader>{header}</SectionHeader> : null}
      <View style={s.listGroup}>
        {rows.map((row, i) => (
          <View key={i}>
            {row}
            {i < rows.length - 1 ? <View style={s.separator} /> : null}
          </View>
        ))}
      </View>
      {footer ? <Text style={[t.footnote, { color: c.secondaryLabel, marginHorizontal: space.base, marginTop: 7 }]}>{footer}</Text> : null}
    </View>
  );
}

// ─── List row ───
export function ListRow({
  icon, title, subtitle, detail, onPress, chevron, trailing, titleColor,
}: {
  icon?: React.ReactNode; title: string; subtitle?: string; detail?: string;
  onPress?: () => void; chevron?: boolean; trailing?: React.ReactNode; titleColor?: string;
}) {
  const { c, t } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={s.row} onPress={onPress} activeOpacity={0.6}>
      {icon ? <View style={s.rowIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[t.body, titleColor ? { color: titleColor } : null]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 1 }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {detail ? <Text style={[t.body, { color: c.secondaryLabel }]} numberOfLines={1}>{detail}</Text> : null}
      {trailing}
      {chevron ? <ChevronRight size={18} color={c.gray3} style={{ marginLeft: 4 }} /> : null}
    </Wrap>
  );
}

// ─── Buttons ───
type BtnVariant = "filled" | "tinted" | "plain" | "destructive";
export function Button({ title, onPress, variant = "filled", disabled, style }: {
  title: string; onPress?: () => void; variant?: BtnVariant; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c, t } = useTheme();
  const palette: Record<BtnVariant, { bg: string; fg: string }> = {
    filled: { bg: c.tint, fg: c.onTint },
    tinted: { bg: c.tintFill, fg: c.tint },
    destructive: { bg: c.red, fg: c.white },
    plain: { bg: "transparent", fg: c.tint },
  };
  const p = palette[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        { height: 52, borderRadius: radius.button, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, ...continuous, backgroundColor: p.bg },
        variant === "filled" && !disabled && shadow.glow,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[t.headline, { color: p.fg }]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── Segmented control ───
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const { c, t } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[s.segment, active && s.segmentActive]} activeOpacity={0.7} onPress={() => onChange(o.value)}>
            <Text style={[t.subheadline, { fontWeight: active ? "600" : "400", color: c.label }]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Capsule badge / pill ───
export function Pill({ label, color, fill }: { label: string; color?: string; fill?: string }) {
  const { c, t } = useTheme();
  return (
    <View style={{ borderRadius: radius.capsule, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", backgroundColor: fill ?? c.tintFill }}>
      <Text style={[t.caption1, { color: color ?? c.tint, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  navBar: {
    flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator, backgroundColor: c.systemBackground,
  },
  navBack: { flexDirection: "row", alignItems: "center", minWidth: 80, height: 44 },
  navTrailing: { minWidth: 80, alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end" },
  listGroup: { backgroundColor: c.groupedSecondary, borderRadius: radius.card, overflow: "hidden", ...continuous, ...shadow.card },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: space.base + 28 + space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.base, minHeight: 44, paddingVertical: 11 },
  rowIcon: { width: 28, height: 28, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: c.tintFill, ...continuous },
  segmented: { flexDirection: "row", backgroundColor: c.tertiaryFill, borderRadius: radius.sm + 1, padding: 2, gap: 2 },
  segment: { flex: 1, height: 32, borderRadius: radius.sm - 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm, ...continuous },
  segmentActive: { backgroundColor: c.groupedSecondary, ...shadow.card },
});

export { useTheme, space, radius, shadow, continuous } from "../theme";
export type { Palette } from "../theme";
