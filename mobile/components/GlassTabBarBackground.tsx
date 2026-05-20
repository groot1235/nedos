import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";

export function GlassTabBarBackground() {
  if (Platform.OS === "web") {
    return <View style={[StyleSheet.absoluteFill, styles.web]} />;
  }

  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 85 : 70}
      tint="light"
      style={StyleSheet.absoluteFill}
    />
  );
}

const styles = StyleSheet.create({
  web: {
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0, 0, 0, 0.08)",
  },
});
