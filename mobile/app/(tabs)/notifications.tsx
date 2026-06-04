import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { API_URL } from "@/utils/api";
import { useUserContext } from "@/context/UserContext";

type NotificationType = {
  _id: string;
  from: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  to: string;
  type: "follow" | "like" | "comment" | "repost";
  post?: {
    _id: string;
    content?: string;
    image?: string;
  } | null;
  comment?: {
    _id: string;
    content: string;
  } | null;
  createdAt: string;
};

const defaultAvatar =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

export default function NotificationsScreen() {
  const { getToken } = useAuth();
  const { dbUser } = useUserContext();
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (dbUser) {
      fetchNotifications();
    }
  }, [dbUser]);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch notifications");
      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("Error refreshing notifications:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    // Optimistic UI update
    setNotifications((prev) => prev.filter((n) => n._id !== notificationId));

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete notification");
      }
    } catch (err) {
      console.error("Error deleting notification:", err);
      // Revert if error
      handleRefresh();
    }
  };

  const getRelativeTime = (dateString: string) => {
    if (!dateString) return "";
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return "just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getNotificationConfig = (type: string) => {
    switch (type) {
      case "like":
        return {
          icon: <FontAwesome name="heart" size={15} color="#e0245e" />,
          bgColor: "bg-[#e0245e]/5",
          message: "liked your post",
        };
      case "comment":
        return {
          icon: <Feather name="message-circle" size={15} color="#2b4afc" />,
          bgColor: "bg-[#2b4afc]/5",
          message: "replied to your post",
        };
      case "repost":
        return {
          icon: <Feather name="repeat" size={15} color="#17bf63" />,
          bgColor: "bg-[#17bf63]/5",
          message: "reposted your post",
        };
      case "follow":
        return {
          icon: <Feather name="user-plus" size={15} color="#8a3ffc" />,
          bgColor: "bg-[#8a3ffc]/5",
          message: "started following you",
        };
      default:
        return {
          icon: <Feather name="bell" size={15} color="#657786" />,
          bgColor: "bg-gray-100",
          message: "interacted with you",
        };
    }
  };

  const renderNotification = ({ item }: { item: NotificationType }) => {
    const config = getNotificationConfig(item.type);
    const sender = item.from;

    if (!sender) return null;

    const senderName = `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || sender.username;

    return (
      <View className="flex-row items-start justify-between p-4 border-b border-gray-50 bg-white">
        {/* Type Icon Badge */}
        <View className={`p-2 rounded-full mr-3 ${config.bgColor}`}>
          {config.icon}
        </View>

        {/* Content Details */}
        <View className="flex-1 mr-2 mt-0.5">
          <View className="flex-row items-center flex-wrap">
            <Image
              source={{ uri: sender.profilePicture || defaultAvatar }}
              className="w-6 h-6 rounded-full mr-1.5 bg-gray-100"
            />
            <Text className="font-bold text-gray-900 text-[14px]">
              {senderName}
            </Text>
            <Text className="text-gray-500 text-[14px] ml-1">
              {config.message}
            </Text>
            <Text className="text-gray-400 text-[12px] ml-1.5">
              · {getRelativeTime(item.createdAt)}
            </Text>
          </View>

          {/* Comment content preview */}
          {item.type === "comment" && item.comment && (
            <View className="mt-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
              <Text className="text-gray-700 text-sm italic" numberOfLines={2}>
                "{item.comment.content}"
              </Text>
            </View>
          )}

          {/* Post content preview */}
          {item.post && item.type !== "follow" && (
            <Text className="text-gray-400 text-xs mt-1.5" numberOfLines={1}>
              Post: {item.post.content || "[Image]"}
            </Text>
          )}
        </View>

        {/* Dismiss Button */}
        <TouchableOpacity
          onPress={() => handleDeleteNotification(item._id)}
          className="p-1 -mr-1"
        >
          <Feather name="x" size={16} color="#becbd6" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      {/* Top Header */}
      <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-white">
        <Text className="text-xl font-bold text-gray-900">Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                "Clear All",
                "Are you sure you want to dismiss all notifications?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear All",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        const token = await getToken();
                        // Delete individually or refresh
                        await Promise.all(
                          notifications.map((n) =>
                            fetch(`${API_URL}/api/notifications/${n._id}`, {
                              method: "DELETE",
                              headers: { Authorization: `Bearer ${token}` },
                            })
                          )
                        );
                        setNotifications([]);
                      } catch (err) {
                        console.error("Error clearing all notifications:", err);
                        handleRefresh();
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text className="text-sm font-semibold text-[#2b4afc]">Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item._id}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          isLoading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : (
            <View className="py-24 items-center justify-center px-8">
              <View className="bg-gray-50 p-6 rounded-full mb-4">
                <Feather name="bell" size={32} color="#becbd6" />
              </View>
              <Text className="text-gray-900 font-bold text-lg text-center">
                All caught up!
              </Text>
              <Text className="text-gray-500 text-sm text-center mt-1 leading-5">
                No new notifications. When neighbors like or comment on your activities, they'll show up here.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
