import { SafeAreaView, StyleSheet } from "react-native";
import DarbPointsScreen from "../../src/screens/DarbPointsScreen";

export default function PointsRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <DarbPointsScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f7" },
});
