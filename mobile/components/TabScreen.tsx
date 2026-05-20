import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TabScreenProps = {
  children: ReactNode;
  className?: string;
};

export function TabScreen({ children, className = "bg-white" }: TabScreenProps) {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SafeAreaView className={`flex-1 ${className}`} edges={["top"]}>
      <View className="flex-1" style={{ paddingBottom: tabBarHeight }}>
        {children}
      </View>
    </SafeAreaView>
  );
}
