import React, { useEffect, useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";

type PostType = {
  _id: string;
  user: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  content: string;
  image?: string;
  images?: string[];
  likes: string[];
  comments: any[];
  savedBy?: string[];
  createdAt: string;
};

type TargetUserType = {
  _id: string;
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  profilePicture?: string;
  bannerImage?: string;
  bio?: string;
  location?: string;
  followers: string[];
  following: string[];
  createdAt: string;
};

// Parse and format hashtags, mentions, and URLs
const renderFormattedContent = (content: string, router: any) => {
  if (!content) return null;

  const parts = content.split(/(https?:\/\/\S+|www\.\S+|#\w+|@\w+)/g);

  return (
    <Text className="text-gray-900 text-[15px] mt-1 leading-5">
      {parts.map((part, index) => {
        if (part.startsWith("#")) {
          return (
            <Text
              key={index}
              className="text-[#2b4afc] font-semibold"
              onPress={() => {
                router.push({
                  pathname: "/search",
                  params: { q: part }
                });
              }}
            >
              {part}
            </Text>
          );
        } else if (part.startsWith("@")) {
          const username = part.substring(1).replace(/[^\w]/g, "");
          return (
            <Text
              key={index}
              className="text-[#2b4afc] font-semibold"
              onPress={() => {
                router.push(`/user/${username}` as any);
              }}
            >
              {part}
            </Text>
          );
        } else if (/^(https?:\/\/|www\.)/.test(part)) {
          const url = part.startsWith("http") ? part : `https://${part}`;
          return (
            <Text
              key={index}
              className="text-[#2b4afc] underline"
              onPress={() => {
                Linking.openURL(url).catch(() => {});
              }}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
};

// Render responsive multi-image collages
const renderPostImages = (images?: string[], fallbackImage?: string) => {
  const displayImages = images && images.length > 0 
    ? images 
    : fallbackImage 
      ? [fallbackImage] 
      : [];

  if (displayImages.length === 0) return null;

  const numImages = displayImages.length;
  if (numImages === 1) {
    return (
      <Image
        source={{ uri: displayImages[0] }}
        className="w-full h-52 rounded-xl mt-3 bg-gray-100"
        resizeMode="cover"
      />
    );
  }

  if (numImages === 2) {
    return (
      <View className="flex-row gap-2 mt-3 h-40">
        <Image source={{ uri: displayImages[0] }} className="flex-1 rounded-xl bg-gray-100" resizeMode="cover" />
        <Image source={{ uri: displayImages[1] }} className="flex-1 rounded-xl bg-gray-100" resizeMode="cover" />
      </View>
    );
  }

  if (numImages === 3) {
    return (
      <View className="flex-row gap-2 mt-3 h-44">
        <Image source={{ uri: displayImages[0] }} className="flex-[2] rounded-l-xl bg-gray-100" resizeMode="cover" />
        <View className="flex-1 gap-2">
          <Image source={{ uri: displayImages[1] }} className="flex-1 rounded-tr-xl bg-gray-100" resizeMode="cover" />
          <Image source={{ uri: displayImages[2] }} className="flex-1 rounded-br-xl bg-gray-100" resizeMode="cover" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row gap-2 mt-3 h-48">
      <View className="flex-1 gap-2">
        <Image source={{ uri: displayImages[0] }} className="flex-1 rounded-tl-xl bg-gray-100" resizeMode="cover" />
        <Image source={{ uri: displayImages[1] }} className="flex-1 rounded-bl-xl bg-gray-100" resizeMode="cover" />
      </View>
      <View className="flex-1 gap-2">
        <Image source={{ uri: displayImages[2] }} className="flex-1 rounded-tr-xl bg-gray-100" resizeMode="cover" />
        <View className="flex-1 relative rounded-br-xl overflow-hidden">
          <Image source={{ uri: displayImages[3] }} className="w-full h-full bg-gray-100" resizeMode="cover" />
          {numImages > 4 && (
            <View className="absolute inset-0 bg-black/50 items-center justify-center">
              <Text className="text-white font-bold text-lg">+{numImages - 4}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { dbUser, syncDbUser } = useUserContext();

  const [targetUser, setTargetUser] = useState<TargetUserType | null>(null);
  const [posts, setPosts] = useState<PostType[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowMutating, setIsFollowMutating] = useState(false);

  const defaultBanner =
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";
  const defaultAvatar =
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

  const isCurrentUser = dbUser?.username === username;

  useEffect(() => {
    if (username) {
      fetchUserProfile();
      fetchUserPosts();
    }
  }, [username]);

  useEffect(() => {
    if (targetUser && dbUser) {
      const targetId = targetUser._id;
      setIsFollowing(dbUser.following?.includes(targetId) || false);
    }
  }, [targetUser, dbUser]);

  const fetchUserProfile = async () => {
    try {
      setIsLoadingProfile(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/profile/${username}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          Alert.alert("Error", "User not found");
          router.back();
          return;
        }
        throw new Error("Failed to fetch user profile");
      }

      const data = await response.json();
      setTargetUser(data.user);
      setFollowersCount(data.user?.followers?.length || 0);
    } catch (err) {
      console.error("Error fetching user profile:", err);
      Alert.alert("Error", "Failed to load user profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchUserPosts = async () => {
    try {
      setIsLoadingPosts(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/user/${username}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error("Error fetching user posts:", err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const handleLikePost = async (postId: string) => {
    if (!dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to like post");

      setPosts((prev) =>
        prev.map((p) => {
          if (p._id === postId) {
            const hasLiked = p.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.likes.filter((id) => id !== dbUser._id)
              : [...p.likes, dbUser._id];
            return { ...p, likes };
          }
          return p;
        })
      );
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  const handleSavePost = async (postId: string) => {
    if (!dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${postId}/save`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to save post");

      setPosts((prev) =>
        prev.map((p) => {
          if (p._id === postId) {
            const savedBy = p.savedBy || [];
            const hasSaved = savedBy.includes(dbUser._id);
            const nextSavedBy = hasSaved
              ? savedBy.filter((id) => id !== dbUser._id)
              : [...savedBy, dbUser._id];
            return { ...p, savedBy: nextSavedBy };
          }
          return p;
        })
      );
    } catch (err) {
      console.error("Error saving post:", err);
    }
  };

  const handleFollowToggle = async () => {
    if (!targetUser || !dbUser || isFollowMutating) return;
    setIsFollowMutating(true);

    const oldIsFollowing = isFollowing;
    const oldFollowersCount = followersCount;

    // Optimistic Update
    setIsFollowing(!oldIsFollowing);
    setFollowersCount((prev) => (oldIsFollowing ? prev - 1 : prev + 1));

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/follow/${targetUser._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to follow/unfollow user");

      // Sync local context state
      await syncDbUser();
    } catch (err) {
      console.error("Error toggling follow:", err);
      // Revert optimistic update
      setIsFollowing(oldIsFollowing);
      setFollowersCount(oldFollowersCount);
      Alert.alert("Error", "Failed to update follow status. Please try again.");
    } finally {
      setIsFollowMutating(false);
    }
  };

  const handleMessageUser = () => {
    if (!targetUser) return;
    
    // Route to messages tab and pass params to auto-open chat modal
    router.push({
      pathname: "/(tabs)/messages",
      params: {
        openUserId: targetUser._id,
        openUserName: `${targetUser.firstName} ${targetUser.lastName}`.trim() || targetUser.username,
        openUserUsername: targetUser.username,
        openUserAvatar: targetUser.profilePicture || defaultAvatar,
      },
    });
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/api/posts/${postId}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!response.ok) throw new Error("Failed to delete post");

            setPosts((prev) => prev.filter((p) => p._id !== postId));
            Alert.alert("Success", "Post deleted successfully");
          } catch (err) {
            console.error("Error deleting post:", err);
            Alert.alert("Error", "Failed to delete post");
          }
        },
      },
    ]);
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

  const getFormattedJoinedDate = (dateVal?: any) => {
    if (!dateVal) return "";
    const date = new Date(dateVal);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const renderPostItem = ({ item }: { item: PostType }) => {
    const isOwnPost = item.user?.username === dbUser?.username;
    const hasLiked = dbUser?._id ? item.likes?.includes(dbUser._id) : false;
    const isSaved = dbUser?._id ? item.savedBy?.includes(dbUser._id) : false;

    return (
      <View className="px-4 py-3.5 border-b border-gray-100 flex-row bg-white">
        {/* Post Profile Image */}
        <Image
          source={{
            uri: item.user?.profilePicture || defaultAvatar,
          }}
          className="w-11 h-11 rounded-full mr-3 bg-gray-100"
        />

        {/* Post Content */}
        <View className="flex-1">
          {/* Header Row */}
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center flex-wrap gap-x-1.5 flex-1">
              <Text className="font-bold text-gray-900 text-[15px]" numberOfLines={1}>
                {`${item.user?.firstName || ""} ${item.user?.lastName || ""}`.trim() ||
                  item.user?.username ||
                  "User"}
              </Text>
              <Text className="text-gray-500 text-[14px]" numberOfLines={1}>
                @{item.user?.username || "username"}
              </Text>
              <Text className="text-gray-400 text-[14px]">·</Text>
              <Text className="text-gray-500 text-[14px]">
                {getRelativeTime(item.createdAt)}
              </Text>
            </View>
            
            {isOwnPost && (
              <TouchableOpacity onPress={() => handleDeletePost(item._id)} className="p-1">
                <Feather name="trash-2" size={15} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>

          {/* Text Content */}
          {renderFormattedContent(item.content, router)}

          {/* Optional Post Image / Collaged images */}
          {renderPostImages(item.images, item.image)}

          {/* Actions Row */}
          <View className="flex-row justify-between items-center mt-3.5 pr-8">
            <TouchableOpacity className="flex-row items-center gap-1.5 p-1">
              <Feather name="message-circle" size={17} color="#657786" />
              <Text className="text-gray-500 text-xs">{item.comments?.length || 0}</Text>
            </TouchableOpacity>

            <TouchableOpacity className="flex-row items-center gap-1.5 p-1">
              <Feather name="repeat" size={16} color="#657786" />
              <Text className="text-gray-500 text-xs">0</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleLikePost(item._id)}
              className="flex-row items-center gap-1.5 p-1"
            >
              <FontAwesome
                name={hasLiked ? "heart" : "heart-o"}
                size={16}
                color={hasLiked ? "#e0245e" : "#657786"}
              />
              <Text className={`text-xs ${hasLiked ? "text-[#e0245e]" : "text-gray-500"}`}>
                {item.likes?.length || 0}
              </Text>
            </TouchableOpacity>

            {/* Save/Bookmark Action */}
            <TouchableOpacity
              onPress={() => handleSavePost(item._id)}
              className="p-1"
            >
              <FontAwesome
                name={isSaved ? "bookmark" : "bookmark-o"}
                size={16}
                color={isSaved ? "#2b4afc" : "#657786"}
              />
            </TouchableOpacity>

            <TouchableOpacity className="p-1">
              <Feather name="share-2" size={16} color="#657786" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (isLoadingProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2b4afc" />
      </View>
    );
  }

  if (!targetUser) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-4">
        <Text className="text-gray-500 text-lg font-semibold">User not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-2.5 bg-blue-500 rounded-full"
        >
          <Text className="text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const profileHeader = (
    <View className="bg-white">
      {/* Cover Banner Image */}
      <Image
        source={{
          uri: targetUser.bannerImage || defaultBanner,
        }}
        className="w-full h-36 bg-gray-200"
        resizeMode="cover"
      />

      {/* Profile Details Block */}
      <View className="px-4 -mt-14 flex-row justify-between items-end">
        {/* Avatar Image overlapping banner */}
        <Image
          source={{
            uri: targetUser.profilePicture || defaultAvatar,
          }}
          className="w-24 h-24 rounded-full border-4 border-white bg-white"
        />

        {/* Action Buttons */}
        <View className="flex-row gap-2 mb-2">
          {isCurrentUser ? (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/profile")}
              className="px-5 py-2.5 rounded-full border border-gray-300 bg-white"
            >
              <Text className="text-gray-900 font-bold text-[14px]">Edit profile</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Message button */}
              <TouchableOpacity
                onPress={handleMessageUser}
                className="p-2.5 rounded-full border border-gray-300 bg-white justify-center items-center"
              >
                <Feather name="mail" size={18} color="#2b4afc" />
              </TouchableOpacity>

              {/* Follow Button */}
              <TouchableOpacity
                onPress={handleFollowToggle}
                className={`px-5 py-2 rounded-full justify-center items-center ${
                  isFollowing ? "bg-white border border-gray-300" : "bg-black"
                }`}
              >
                <Text
                  className={`font-bold text-[14px] ${
                    isFollowing ? "text-gray-900" : "text-white"
                  }`}
                >
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* User Identity Info */}
      <View className="px-4 mt-3">
        <Text className="text-2xl font-bold text-gray-900 leading-7">
          {`${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim() || targetUser.username}
        </Text>
        <Text className="text-gray-500 text-[15px]">
          @{targetUser.username}
        </Text>

        {/* Bio */}
        {targetUser.bio ? (
          <Text className="text-gray-900 text-[15px] mt-3 leading-5">
            {targetUser.bio}
          </Text>
        ) : (
          <Text className="text-gray-400 text-[15px] mt-3 italic">
            No bio yet.
          </Text>
        )}
      </View>

      {/* Details (Location, Joined) */}
      <View className="px-4 mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
        {targetUser.location ? (
          <View className="flex-row items-center">
            <Feather name="map-pin" size={14} color="#657786" />
            <Text className="text-gray-500 text-[14px] ml-1.5">{targetUser.location}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center">
          <Feather name="calendar" size={14} color="#657786" />
          <Text className="text-gray-500 text-[14px] ml-1.5">
            Joined {getFormattedJoinedDate(targetUser.createdAt)}
          </Text>
        </View>
      </View>

      {/* Follow Stats counts */}
      <View className="px-4 mt-3.5 flex-row gap-4 border-b border-gray-100 pb-3.5">
        <View className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {targetUser.following?.length || 0}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Following</Text>
        </View>
        <View className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {followersCount}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Followers</Text>
        </View>
        <View className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {posts.length}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Posts</Text>
        </View>
      </View>
      
      {/* Posts Section Title */}
      <View className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <Text className="font-bold text-gray-700 text-sm tracking-wider uppercase">Posts</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />
      
      {/* Top Navigation Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 bg-white z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 rounded-full bg-gray-50 border border-gray-100"
        >
          <Feather name="arrow-left" size={22} color="#000" />
        </TouchableOpacity>
        <Text className="font-bold text-[17px] text-gray-900">
          @{targetUser.username}
        </Text>
        <View className="w-8" /> {/* Spacer */}
      </View>

      {/* Posts List */}
      <FlatList
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={profileHeader}
        ListEmptyComponent={
          isLoadingPosts ? (
            <View className="py-8 justify-center items-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : (
            <View className="py-12 px-4 items-center justify-center">
              <Feather name="edit-3" size={36} color="#657786" />
              <Text className="text-gray-500 font-bold text-base mt-3">
                No posts yet
              </Text>
              <Text className="text-gray-400 text-sm text-center mt-1">
                This user has not posted anything yet.
              </Text>
            </View>
          )
        }
        refreshing={isLoadingPosts}
        onRefresh={fetchUserPosts}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
