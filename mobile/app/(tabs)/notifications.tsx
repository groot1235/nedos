import { Text, View } from "react-native";
import { TabScreen } from "@/components/TabScreen";

export default function NotificationsScreen() {
  return (
    <TabScreen>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-semibold text-gray-900">
          Notifications
        </Text>
      </View>
    </TabScreen>
  );
}
