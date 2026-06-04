import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassTabBarBackground } from "@/components/GlassTabBarBackground";
import { useSocket } from "@/context/SocketContext";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";

const TAB_BAR_HEIGHT = 56;
const ACTIVE_COLOR = "#2b4afc";
const INACTIVE_COLOR = "#becbd6";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded } = useAuth();
  const { dbUser, isLoading: dbUserLoading } = useUserContext();

  if (!isLoaded || dbUserLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={ACTIVE_COLOR} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  if (dbUser && dbUser.homeLocality === "PENDING") {
    return <Redirect href={"/onboarding" as any} />;
  }

  const { socket } = useSocket();
  const { getToken } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const fetchUnreadCount = async () => {
    if (!dbUser) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const count = data.conversations?.reduce(
          (acc: number, conv: any) => acc + (conv.unreadCount || 0),
          0
        ) || 0;
        setUnreadMessagesCount(count);
      }
    } catch (error) {
      console.error("Error fetching unread count for tabs:", error);
    }
  };

  useEffect(() => {
    if (!dbUser) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 4000);
    return () => clearInterval(interval);
  }, [dbUser]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = () => {
      fetchUnreadCount();
    };
    socket.on("newMessage", handleNewMessage);
    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, [socket, dbUser]);

  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
        sceneStyle: {
          backgroundColor: "#ffffff",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Feather name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color, size }) => (
            <Feather name="bell" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Feather name="mail" size={size} color={color} />
          ),
          tabBarBadge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
