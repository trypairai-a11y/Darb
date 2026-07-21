import { useCallback, useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Banknote, Coins, Phone, TriangleAlert } from "lucide-react-native";
import { getWallet, type AgentRemittance } from "../../src/api/client";
import { LargeTitle, ListGroup, ListRow, Screen } from "../../src/components/hig";
import { formatKwd } from "../../src/i18n/format";
import { t as tr } from "../../src/i18n/strings";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";

export default function WalletScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const wallet = useDriverStore((s) => s.wallet);
  const lockout = useDriverStore((s) => s.lockout);
  const supervisorPhone = useDriverStore((s) => s.supervisorPhone);
  const setWallet = useDriverStore((s) => s.setWallet);

  const [remittances, setRemittances] = useState<AgentRemittance[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getWallet();
      setWallet(res);
      setRemittances(Array.isArray(res.remittances) ? res.remittances : []);
    } catch {
      /* keep showing the store's last-known summary */
    }
  }, [setWallet]);

  // Refresh on focus + whenever a POD response already updated the store.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const cash = Number(wallet?.cashOnHandKwd ?? 0);
  const ceiling = Number(wallet?.ceilingKwd ?? 0);
  const ratio = ceiling > 0 ? Math.min(1, cash / ceiling) : 0;
  const barColor = ratio >= 1 ? c.red : ratio >= 0.8 ? c.orange : c.tint;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <LargeTitle title={tr("wallet.title")} />

        {/* ─── Hero: collected today ─── */}
        <View style={styles.hero}>
          <Text style={[t.caption1, { color: c.secondaryLabel, textTransform: "uppercase", letterSpacing: 1 }]}>
            {tr("wallet.today")}
          </Text>
          <Text style={[t.hero, { color: c.tint, marginTop: 6 }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatKwd(wallet?.todayCollectedKwd)}
          </Text>
        </View>

        {/* ─── Cash on hand vs ceiling ─── */}
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <Text style={[t.caption1, { color: c.secondaryLabel, textTransform: "uppercase", letterSpacing: 1 }]}>
                {tr("wallet.cash_on_hand")}
              </Text>
              <Text style={[t.title1, { marginTop: 4, color: barColor }]}>{formatKwd(cash)}</Text>
            </View>
            {ceiling > 0 ? (
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>
                {tr("wallet.ceiling", { ceiling: formatKwd(ceiling) })}
              </Text>
            ) : null}
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: barColor }]} />
          </View>
        </View>

        {/* ─── Tips (driver keeps 100%) — only when the backend sends them ─── */}
        {wallet?.tipsTodayKwd != null || wallet?.tipsTotalKwd != null ? (
          <ListGroup header={tr("wallet.tips")} footer={tr("wallet.tips_note")} style={{ marginTop: space.xs }}>
            {wallet?.tipsTodayKwd != null ? (
              <ListRow
                icon={<Coins size={16} color={c.tint} />}
                title={tr("wallet.tips_today")}
                detail={formatKwd(wallet.tipsTodayKwd)}
              />
            ) : null}
            {wallet?.tipsTotalKwd != null ? (
              <ListRow
                icon={<Coins size={16} color={c.tint} />}
                title={tr("wallet.tips_total")}
                detail={formatKwd(wallet.tipsTotalKwd)}
              />
            ) : null}
          </ListGroup>
        ) : null}

        {lockout.active ? (
          <View style={styles.lockout}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <TriangleAlert size={18} color={c.warnLabel} />
              <Text style={[t.subheadline, { color: c.warnLabel, fontFamily: undefined, fontWeight: "700", flex: 1 }]}>
                {tr("wallet.lockout_title")}
              </Text>
            </View>
            <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 4 }]}>{tr("wallet.lockout_body")}</Text>
            {supervisorPhone ? (
              <TouchableOpacity
                style={styles.lockoutCall}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(`tel:${supervisorPhone}`).catch(() => {})}
              >
                <Phone size={15} color={c.onTint} />
                <Text style={[t.subheadline, { color: c.onTint, fontFamily: undefined, fontWeight: "700" }]}>
                  {tr("common.call_supervisor")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ─── Remittance history ─── */}
        {remittances.length > 0 ? (
          <ListGroup header={tr("wallet.remittances")} style={{ marginTop: space.sm }}>
            {remittances.map((r) => (
              <ListRow
                key={r.id}
                icon={<Banknote size={16} color={c.tint} />}
                title={formatKwd(r.amountKwd)}
                subtitle={[r.method, new Date(r.createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
              />
            ))}
          </ListGroup>
        ) : (
          <Text style={[t.footnote, { color: c.tertiaryLabel, textAlign: "center", marginTop: space.xxl }]}>
            {tr("wallet.no_remittances")}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  hero: {
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.lg,
    borderWidth: 1, borderColor: "rgba(198,255,58,0.25)", alignItems: "center", ...continuous, ...shadow.card,
  },
  card: {
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: c.hairline, marginTop: space.md, ...continuous, ...shadow.card,
  },
  barTrack: {
    height: 10, borderRadius: 5, backgroundColor: c.gray5, marginTop: space.md, overflow: "hidden",
  },
  barFill: { height: 10, borderRadius: 5 },
  lockout: {
    backgroundColor: c.warnBg, borderRadius: radius.card, padding: space.base, marginTop: space.md,
    borderWidth: 1, borderColor: "rgba(255,184,77,0.22)", ...continuous,
  },
  lockoutCall: {
    marginTop: space.md, height: 40, borderRadius: radius.button, backgroundColor: c.orange,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, ...continuous,
  },
});
