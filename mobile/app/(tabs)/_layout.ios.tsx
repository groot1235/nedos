import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import {
  Icon,
  Label,
  NativeTabs,
} from "expo-router/unstable-native-tabs";
import { ActivityIndicator, View } from "react-native";

const ACTIVE_COLOR = "#1DA1F2";
const INACTIVE_COLOR = "#657786";

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={ACTIVE_COLOR} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <NativeTabs
      blurEffect="systemChromeMaterial"
      iconColor={{ default: INACTIVE_COLOR, selected: ACTIVE_COLOR }}
      labelStyle={{
        default: { color: INACTIVE_COLOR, fontSize: 10 },
        selected: { color: ACTIVE_COLOR, fontSize: 10 },
      }}
      tintColor={ACTIVE_COLOR}
    >
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label hidden>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label hidden>Search</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label hidden>Notifications</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon
          sf={{ default: "envelope", selected: "envelope.fill" }}
        />
        <Label hidden>Messages</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label hidden>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
