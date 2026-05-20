import { useUser } from "@clerk/expo";
import { Text, View } from "react-native";
import { TabScreen } from "@/components/TabScreen";

export default function HomeScreen() {
  const { user } = useUser();

  return (
    <TabScreen>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-semibold text-gray-900 mb-2">
          Home
        </Text>
        <Text className="text-gray-500 text-center">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}
        </Text>
      </View>
    </TabScreen>
  );
}
