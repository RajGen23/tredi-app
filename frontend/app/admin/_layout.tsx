// The Super Admin panel is a separate client that happens to share the bundle.
// Its own stack, its own session, no tab bar and no phone chrome.
import { Stack } from "expo-router";

export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F3F7F5" }, animation: "none" }} />;
}
