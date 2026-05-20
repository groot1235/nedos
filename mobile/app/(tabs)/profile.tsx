import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { TabScreen } from "@/components/TabScreen";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)");
  };

  return (
    <TabScreen>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-semibold text-gray-900 mb-2">
          Profile
        </Text>
        <Text className="text-gray-500 text-center mb-8">
          {user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
        </Text>
        <TouchableOpacity
          className="bg-black rounded-full py-3 px-8"
          onPress={handleSignOut}
        >
          <Text className="text-white font-medium">Sign out</Text>
        </TouchableOpacity>
      </View>
    </TabScreen>
  );
}
