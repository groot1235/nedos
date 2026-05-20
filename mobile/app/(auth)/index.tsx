import Logo from "@/assets/images/logo.svg";
import { useSocialAuth } from "@/hooks/useSocialAuth";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function Index() {
  const { handleSocialAuth, isLoading } = useSocialAuth();

  return (
    <View className="flex-1 bg-white">
      <View className="flex-1 px-8 justify-between">
        <View className="flex-1 justify-center">
          <View className="items-center mb-8">
            <Logo width={160} height={160} />
          </View>

          <View className="flex-col gap-2">
            <TouchableOpacity
              className="flex-row items-center justify-center bg-white border border-gray-300 rounded-full py-3 px-6"
              onPress={() => handleSocialAuth("oauth_google")}
              disabled={isLoading}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <Text className="text-black font-medium text-base">
                  Continue with Google
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-row items-center justify-center bg-white border border-gray-300 rounded-full py-3 px-6"
              onPress={() => handleSocialAuth("oauth_apple")}
              disabled={isLoading}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text className="text-black font-medium text-base">
                  Continue with Apple
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-center text-gray-500 text-xs leading-4 mt-6 px-2">
            By signing up, you agree to our{" "}
            <Text className="text-blue-500">Terms</Text>,{" "}
            <Text className="text-blue-500">Privacy Policy</Text>, and{" "}
            <Text className="text-blue-500">Cookie Use</Text>.
          </Text>
        </View>
      </View>
    </View>
  );
}
