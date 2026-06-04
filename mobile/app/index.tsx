import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useUserContext } from "@/context/UserContext";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const { dbUser, isLoading: dbUserLoading } = useUserContext();

  if (!isLoaded || (isSignedIn && dbUserLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2b4afc" />
      </View>
    );
  }

  if (isSignedIn) {
    if (dbUser && dbUser.homeLocality === "PENDING") {
      return <Redirect href={"/onboarding" as any} />;
    }
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)" />;
}
