import { useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { Package } from "lucide-react-native";
import { Screen, ListGroup, ListRow, Button, Pill } from "../../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, fontFamily } from "../../src/theme";
import { mockEquipment } from "../../src/mockData";
import type { EquipmentItem } from "../../src/api/client";

type Item = EquipmentItem;

export default function EquipmentScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const CONDITION_META: Record<string, { fill: string; fg: string; label: string }> = {
    OK: { fill: c.greenFill, fg: c.green, label: "Good" },
    DAMAGED: { fill: c.redFill, fg: c.red, label: "Damaged" },
    CHANGED: { fill: c.tintFill, fg: c.blue, label: "Changed" },
    CHANGE_REQUESTED: { fill: c.orangeFill, fg: c.orange, label: "Change requested" },
  };
  const ACTIONS = [
    { key: "DAMAGED", label: "Report damaged", color: c.red },
    { key: "CHANGED", label: "Mark changed", color: c.blue },
    { key: "CHANGE_REQUESTED", label: "Request change", color: c.orange },
  ];

  const [items, setItems] = useState<Item[]>(mockEquipment as unknown as Item[]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);
  const close = () => { setSelected(null); setPending(null); setNote(""); };
  const submit = () => {
    if (!selected || !pending) return;
    setItems((prev) => prev.map((it) =>
      it.id === selected.id ? { ...it, condition: pending as Item["condition"], conditionNote: note || it.conditionNote } : it
    ));
    close();
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <Text style={[t.largeTitle, { marginTop: space.sm }]}>Equipment</Text>
        <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2, marginBottom: space.sm }]}>
          Tap an item to report its condition
        </Text>

        <ListGroup footer="Reports go straight to your supervisor.">
          {items.map((item) => {
            const cond = CONDITION_META[item.condition] ?? CONDITION_META.OK;
            return (
              <ListRow
                key={item.id}
                icon={<Package size={17} color={c.tint} />}
                title={item.label}
                subtitle={`Qty ${item.quantity}${item.conditionNote ? ` · ${item.conditionNote}` : ""}`}
                onPress={() => { setSelected(item); setPending(null); setNote(""); }}
                trailing={<Pill label={cond.label} color={cond.fg} fill={cond.fill} />}
              />
            );
          })}
        </ListGroup>
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={t.title3}>{selected?.label}</Text>
            <Text style={[t.subheadline, { color: c.secondaryLabel, marginBottom: space.sm }]}>What's the issue with this item?</Text>

            <View style={{ gap: space.sm }}>
              {ACTIONS.map((a) => {
                const active = pending === a.key;
                return (
                  <TouchableOpacity
                    key={a.key}
                    activeOpacity={0.7}
                    style={[styles.action, { borderColor: a.color }, active && { backgroundColor: a.color }]}
                    onPress={() => setPending(a.key)}
                  >
                    <Text style={[t.headline, { color: active ? c.white : a.color }]}>{a.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor={c.placeholder}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <Button title="Submit report" onPress={submit} disabled={!pending} style={{ marginTop: space.xs }} />
            <Button title="Cancel" variant="plain" onPress={close} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingBottom: space.xxxl },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: c.groupedBackground, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    padding: space.lg, paddingBottom: space.xxxl, gap: space.md, ...continuous,
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: c.gray3, marginBottom: space.xs },
  action: { borderWidth: 1.5, borderRadius: radius.button, paddingVertical: 13, alignItems: "center", ...continuous },
  noteInput: {
    fontFamily, fontSize: 17, color: c.label,
    backgroundColor: c.groupedSecondary, borderRadius: radius.button, padding: space.md,
    minHeight: 70, textAlignVertical: "top", ...continuous,
  },
});
