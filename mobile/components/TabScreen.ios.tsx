import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TabScreenProps = {
  children: ReactNode;
  className?: string;
};

export function TabScreen({ children, className = "bg-white" }: TabScreenProps) {
  return (
    <SafeAreaView className={`flex-1 ${className}`} edges={["top", "bottom"]}>
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}
