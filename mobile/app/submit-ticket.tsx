import { useRef, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Image, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, X, Trash2, Check } from "lucide-react-native";
import { NavBar, Button, Screen } from "../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, fontFamily } from "../src/theme";

const CATEGORIES = [
  { value: "ACCIDENT_REPORT", label: "Accident report" },
  { value: "VEHICLE_REPAIR", label: "Vehicle repair" },
  { value: "EQUIPMENT_REQUEST", label: "Equipment request" },
  { value: "LEAVE_REQUEST", label: "Leave request" },
  { value: "SALARY_ISSUE", label: "Salary issue" },
  { value: "TRANSFER_REQUEST", label: "Transfer request" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "OTHER", label: "Other" },
];

const MAX_PHOTOS = 5;

export default function SubmitTicketScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [category, setCategory] = useState("ACCIDENT_REPORT");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<{ uri: string }[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const categoryLabel = CATEGORIES.find((x) => x.value === category)?.label ?? category;

  async function openCamera() {
    if (photos.length >= MAX_PHOTOS) { Alert.alert("Limit reached", `Up to ${MAX_PHOTOS} photos.`); return; }
    if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
    setCameraOpen(true);
  }
  async function capture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) setPhotos((prev) => [...prev, { uri: photo.uri }]);
    } catch (e: any) { Alert.alert("Camera error", e.message ?? "Failed to capture photo"); }
    finally { setCameraOpen(false); }
  }
  async function onSubmit() {
    if (!title.trim()) { Alert.alert("Missing field", "Please enter a title."); return; }
    if (!description.trim()) { Alert.alert("Missing field", "Please enter a description."); return; }
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); router.replace("/(tabs)/tickets"); }, 700);
  }

  return (
    <Screen>
      <NavBar title="New ticket" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.label}>CATEGORY</Text>
          <TouchableOpacity style={styles.select} activeOpacity={0.7} onPress={() => setCategoryOpen(true)}>
            <Text style={t.body}>{categoryLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>TITLE</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Short summary" placeholderTextColor={c.placeholder} maxLength={120} />

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription}
            placeholder="What happened? Add any details that help your supervisor."
            placeholderTextColor={c.placeholder} multiline textAlignVertical="top"
          />

          <Text style={styles.label}>PHOTOS ({photos.length}/{MAX_PHOTOS})</Text>
          <View style={styles.photosGrid}>
            {photos.map((p, idx) => (
              <View key={idx} style={styles.photoCell}>
                <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} />
                <TouchableOpacity style={styles.removeBtn} onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}>
                  <Trash2 size={14} color={c.white} />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <TouchableOpacity style={styles.addPhoto} activeOpacity={0.7} onPress={openCamera}>
                <Camera size={22} color={c.secondaryLabel} />
                <Text style={[t.caption1, { color: c.secondaryLabel }]}>Add photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Button title={submitting ? "" : "Submit ticket"} onPress={onSubmit} disabled={submitting} style={{ marginTop: space.xl }} />
          {submitting ? <ActivityIndicator color={c.white} style={styles.submitSpinner} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setCategoryOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={[t.footnote, { color: c.secondaryLabel, textAlign: "center", marginBottom: space.sm }]}>PICK A CATEGORY</Text>
            {CATEGORIES.map((x) => (
              <TouchableOpacity key={x.value} style={styles.sheetRow} onPress={() => { setCategory(x.value); setCategoryOpen(false); }}>
                <Text style={[t.body, { color: category === x.value ? c.tint : c.label }]}>{x.label}</Text>
                {category === x.value ? <Check size={18} color={c.tint} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.cameraClose} onPress={() => setCameraOpen(false)}>
              <X size={24} color={c.white} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureBtn} onPress={capture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  body: { padding: space.base, paddingBottom: space.xxxl },
  label: { fontFamily, fontSize: 13, color: c.secondaryLabel, marginLeft: space.xs, marginTop: space.lg, marginBottom: 7, letterSpacing: 0.4 },
  select: { backgroundColor: c.groupedSecondary, borderRadius: radius.field, paddingHorizontal: space.base, height: 48, justifyContent: "center", ...continuous },
  input: { fontFamily, fontSize: 17, color: c.label, backgroundColor: c.groupedSecondary, borderRadius: radius.field, paddingHorizontal: space.base, paddingVertical: 13, ...continuous },
  textarea: { minHeight: 130, paddingTop: space.md },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  photoCell: { width: 88, height: 88, borderRadius: radius.button, overflow: "hidden", ...continuous },
  removeBtn: { position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  addPhoto: { width: 88, height: 88, borderRadius: radius.button, borderWidth: 1.5, borderColor: c.gray4, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, ...continuous },
  submitSpinner: { position: "absolute", bottom: 38, alignSelf: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.groupedBackground, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.base, paddingBottom: space.xxxl, ...continuous },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: c.gray3, marginBottom: space.md },
  sheetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
  cameraOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 60, paddingTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  cameraClose: { position: "absolute", left: 24, bottom: 80, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: c.white, alignItems: "center", justifyContent: "center" },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.white },
});
