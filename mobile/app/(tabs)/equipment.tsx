import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, SafeAreaView, ActivityIndicator, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Package, Inbox } from "lucide-react-native";
import {
  fetchMyEquipment, reportEquipmentCondition,
  EquipmentItem, ReportableCondition,
} from "../../src/api/client";

const CONDITION_META: Record<string, { bg: string; fg: string; label: string }> = {
  OK: { bg: "#D1FAE5", fg: "#065F46", label: "Good" },
  DAMAGED: { bg: "#FEE2E2", fg: "#991B1B", label: "Damaged" },
  CHANGED: { bg: "#DBEAFE", fg: "#1E40AF", label: "Changed" },
  CHANGE_REQUESTED: { bg: "#FEF3C7", fg: "#92400E", label: "Change requested" },
};

const ACTIONS: { key: ReportableCondition; label: string; color: string }[] = [
  { key: "DAMAGED", label: "Report damaged", color: "#DC2626" },
  { key: "CHANGED", label: "Mark changed", color: "#2563EB" },
  { key: "CHANGE_REQUESTED", label: "Request change", color: "#D97706" },
];

export default function EquipmentScreen() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<EquipmentItem | null>(null);
  const [pendingAction, setPendingAction] = useState<ReportableCondition | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchMyEquipment();
      setItems(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load equipment");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchItems();
    }, [fetchItems])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const openSheet = (item: EquipmentItem) => {
    setSelected(item);
    setPendingAction(null);
    setNote("");
  };

  const closeSheet = () => {
    setSelected(null);
    setPendingAction(null);
    setNote("");
  };

  const submit = async () => {
    if (!selected || !pendingAction) return;
    setSubmitting(true);
    try {
      const updated = await reportEquipmentCondition(selected.id, pendingAction, note);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      closeSheet();
    } catch (e: any) {
      Alert.alert("Could not submit", e.message ?? "Please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Equipment</Text>
        <Text style={styles.subtitle}>Tap an item to report its condition</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#007A3D" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007A3D" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Inbox size={36} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No equipment assigned</Text>
              <Text style={styles.emptyBody}>Pull to refresh.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cond = CONDITION_META[item.condition] ?? CONDITION_META.OK;
            return (
              <TouchableOpacity style={styles.row} onPress={() => openSheet(item)}>
                <View style={styles.rowIcon}>
                  <Package size={20} color="#007A3D" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  <Text style={styles.metaText}>
                    Qty {item.quantity}
                    {item.conditionNote ? ` · ${item.conditionNote}` : ""}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: cond.bg }]}>
                  <Text style={[styles.pillText, { color: cond.fg }]}>{cond.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={closeSheet} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{selected?.label}</Text>
            <Text style={styles.sheetSub}>What's the issue with this item?</Text>

            <View style={styles.actions}>
              {ACTIONS.map((a) => {
                const active = pendingAction === a.key;
                return (
                  <TouchableOpacity
                    key={a.key}
                    style={[
                      styles.actionBtn,
                      { borderColor: a.color },
                      active && { backgroundColor: a.color },
                    ]}
                    onPress={() => setPendingAction(a.key)}
                  >
                    <Text style={[styles.actionText, { color: active ? "#fff" : a.color }]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, (!pendingAction || submitting) && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={!pendingAction || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit report</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={closeSheet}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    backgroundColor: "#fff", borderBottomColor: "#E5E7EB", borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  listContent: { padding: 16, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  empty: { alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginTop: 8 },
  emptyBody: { fontSize: 14, color: "#6B7280" },
  row: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderColor: "#E5E7EB", borderWidth: 1, marginBottom: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: "#ECFDF3",
    alignItems: "center", justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  metaText: { fontSize: 12, color: "#6B7280" },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { color: "#B91C1C", fontSize: 14, paddingHorizontal: 24, textAlign: "center" },

  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 12,
  },
  sheetHandle: {
    alignSelf: "center", width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#D1D5DB", marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  sheetSub: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  actions: { gap: 10 },
  actionBtn: {
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center",
  },
  actionText: { fontSize: 15, fontWeight: "600" },
  noteInput: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12,
    minHeight: 64, fontSize: 14, color: "#111827", textAlignVertical: "top",
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: "#007A3D", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelBtn: { alignItems: "center", paddingVertical: 6 },
  cancelText: { color: "#6B7280", fontSize: 15, fontWeight: "500" },
});
