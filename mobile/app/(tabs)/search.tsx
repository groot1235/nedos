import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import {
  View,
  TextInput,
  ScrollView,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL } from "@/utils/api";

const TRENDING_TOPICS = [
  { topic: "#ReactNative", tweets: "125K" },
  { topic: "#TypeScript", tweets: "89K" },
  { topic: "#WebDevelopment", tweets: "234K" },
  { topic: "#AI", tweets: "567K" },
  { topic: "#TechNews", tweets: "98K" },
];

type SearchedUser = {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  isFollowing: boolean;
};

const SearchScreen = () => {
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<SearchedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchText.trim()) {
        searchBackendUsers(searchText);
      } else {
        setUsers([]);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(delayDebounce);
  }, [searchText]);

  const searchBackendUsers = async (query: string) => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Error in search:", error, `(API: ${API_URL})`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowToggle = async (targetUser: SearchedUser) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/follow/${targetUser._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Follow toggle failed");
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u._id === targetUser._id ? { ...u, isFollowing: !u.isFollowing } : u))
      );
    } catch (error) {
      console.error("Error following/unfollowing:", error);
      Alert.alert("Error", "Failed to update follow status");
    }
  };

  const handleMessageUser = (user: SearchedUser) => {
    // Navigate to messages tab and pass search parameters to open chat
    router.push({
      pathname: "/(tabs)/messages",
      params: {
        openUserId: user._id,
        openUserName: `${user.firstName} ${user.lastName}`.trim() || user.username,
        openUserUsername: user.username,
        openUserAvatar: user.profilePicture || "",
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER */}
      <View className="px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-full px-4 py-3">
          <Feather name="search" size={20} color="#657786" />
          <TextInput
            placeholder="Search Nedos"
            className="flex-1 ml-3 text-base"
            placeholderTextColor="#657786"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Feather name="x" size={18} color="#657786" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <View className="py-8 justify-center items-center">
            <ActivityIndicator size="small" color="#2b4afc" />
          </View>
        ) : searchText.trim() ? (
          <View className="p-4">
            <Text className="text-gray-500 font-semibold text-sm mb-3">People</Text>
            {users.length === 0 ? (
              <Text className="text-gray-500 text-center py-6">No users found</Text>
            ) : (
              users.map((user) => (
                <View
                  key={user._id}
                  className="flex-row items-center justify-between py-3 border-b border-gray-100"
                >
                  <View className="flex-row items-center flex-1 mr-3">
                    <Image
                      source={{
                        uri:
                          user.profilePicture ||
                          "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
                      }}
                      className="size-12 rounded-full mr-3"
                    />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>
                        {`${user.firstName} ${user.lastName}`.trim() || user.username}
                      </Text>
                      <Text className="text-gray-500 text-sm" numberOfLines={1}>
                        @{user.username}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() => handleMessageUser(user)}
                      className="p-2 bg-gray-100 rounded-full"
                    >
                      <Feather name="mail" size={18} color="#2b4afc" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleFollowToggle(user)}
                      className={`px-4 py-1.5 rounded-full border ${
                        user.isFollowing
                          ? "bg-white border-gray-300"
                          : "bg-blue-500 border-blue-500"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          user.isFollowing ? "text-gray-700" : "text-white"
                        }`}
                      >
                        {user.isFollowing ? "Following" : "Follow"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View className="p-4">
            <Text className="text-xl font-bold text-gray-900 mb-4">Trending for you</Text>
            {TRENDING_TOPICS.map((item, index) => (
              <TouchableOpacity key={index} className="py-3 border-b border-gray-100">
                <Text className="text-gray-500 text-sm">Trending in Technology</Text>
                <Text className="font-bold text-gray-900 text-lg">{item.topic}</Text>
                <Text className="text-gray-500 text-sm">{item.tweets} Tweets</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SearchScreen;