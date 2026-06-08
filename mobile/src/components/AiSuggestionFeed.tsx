/**
 * AiSuggestionFeed — horizontally-scrolling AI suggestion cards (HIG, light+dark).
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../theme";
import { mockAiSuggestions } from "../mockData";

type SuggestionType =
  | "GO_ONLINE_SURGE" | "TAKE_SHIFT" | "APPEAL_VIOLATION" | "BONUS_PROXIMITY"
  | "ROUTE_OPTIMIZATION" | "REST_BREAK" | "EARNINGS_INSIGHT";

function accentFor(type: SuggestionType, c: Palette): { accent: string; emoji: string } {
  switch (type) {
    case "GO_ONLINE_SURGE": return { accent: c.orange, emoji: "⚡️" };
    case "TAKE_SHIFT": return { accent: c.indigo, emoji: "🗓" };
    case "APPEAL_VIOLATION": return { accent: c.red, emoji: "⚖️" };
    case "BONUS_PROXIMITY": return { accent: c.green, emoji: "🎯" };
    case "ROUTE_OPTIMIZATION": return { accent: c.blue, emoji: "🧭" };
    case "REST_BREAK": return { accent: c.purple, emoji: "☕️" };
    default: return { accent: c.teal, emoji: "💰" };
  }
}

export const AiSuggestionFeed: React.FC<{ language?: "en" | "ar" }> = ({ language = "en" }) => {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const isAr = language === "ar";
  const items = mockAiSuggestions;
  if (items.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {items.map((s, i) => {
        const meta = accentFor(s.type as SuggestionType, c);
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.emoji}>{meta.emoji}</Text>
              {s.estimatedValueKD != null ? (
                <View style={[styles.badge, { backgroundColor: meta.accent }]}>
                  <Text style={[t.caption1, { color: c.white, fontWeight: "700" }]}>+{s.estimatedValueKD} KD</Text>
                </View>
              ) : null}
            </View>
            <Text style={[t.headline, { color: meta.accent }]} numberOfLines={2}>{isAr ? s.titleAr : s.title}</Text>
            <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]} numberOfLines={3}>{isAr ? s.bodyAr : s.body}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
};

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { marginHorizontal: -space.base, marginBottom: space.md },
  row: { paddingHorizontal: space.base, gap: space.md, paddingVertical: space.xs },
  card: { width: 230, backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base, ...continuous, ...shadow.card },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  emoji: { fontSize: 22 },
  badge: { borderRadius: radius.capsule, paddingHorizontal: 9, paddingVertical: 3 },
});

export default AiSuggestionFeed;
