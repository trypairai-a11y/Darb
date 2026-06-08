import { Redirect } from "expo-router";

// Demo build: the whole app runs on mock data, so skip enrollment and go
// straight to the dashboard. (To restore live enrollment, gate this on a
// stored agent_token and redirect to "/enrollment" when absent.)
export default function SplashScreen() {
  return <Redirect href="/(tabs)/dashboard" />;
}
