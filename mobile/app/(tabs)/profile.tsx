import React, { useEffect, useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  FlatList,
  Linking,
} from "react-native";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { TabScreen } from "@/components/TabScreen";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";

const convertUriToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

type PostType = {
  _id: string;
  user: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
    location?: string;
  };
  content: string;
  image?: string;
  images?: string[];
  likes: string[];
  comments: any[];
  savedBy?: string[];
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

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { dbUser, isLoading: dbLoading, syncDbUser } = useUserContext();
  const router = useRouter();

  // Tab State
  const [activeTab, setActiveTab] = useState<"posts" | "likes" | "saved">("posts");

  // Posts Feed State
  const [posts, setPosts] = useState<PostType[]>([]);
  const [likedPosts, setLikedPosts] = useState<PostType[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostType[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);

  // Edit Profile Form State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Load form values when dbUser is available
  useEffect(() => {
    if (dbUser) {
      setFirstName(dbUser.firstName || "");
      setLastName(dbUser.lastName || "");
      setBio(dbUser.bio || "");
      setLocation(dbUser.location || "");
      setProfilePicture(dbUser.profilePicture || "");
      setBannerImage(dbUser.bannerImage || "");
    }
  }, [dbUser]);

  // Fetch posts depending on active tab
  useEffect(() => {
    if (dbUser) {
      if (activeTab === "posts") {
        fetchUserPosts();
      } else if (activeTab === "likes") {
        fetchLikedPosts();
      } else if (activeTab === "saved") {
        fetchSavedPosts();
      }
    }
  }, [activeTab, dbUser]);

  const fetchUserPosts = async () => {
    if (!dbUser?.username) return;
    try {
      setIsPostsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/user/${dbUser.username}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch user posts");
      const data = await response.json();
      setPosts(data.posts || []);
    } catch (err) {
      console.error("Error fetching user posts:", err);
    } finally {
      setIsPostsLoading(false);
    }
  };

  const fetchLikedPosts = async () => {
    if (!dbUser?._id) return;
    try {
      setIsPostsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch liked posts");
      const data = await response.json();
      const liked = (data.posts || []).filter((p: any) => p.likes?.includes(dbUser._id));
      setLikedPosts(liked);
    } catch (err) {
      console.error("Error fetching liked posts:", err);
    } finally {
      setIsPostsLoading(false);
    }
  };

  const fetchSavedPosts = async () => {
    try {
      setIsPostsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/saved`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch saved posts");
      const data = await response.json();
      setSavedPosts(data.posts || []);
    } catch (err) {
      console.error("Error fetching saved posts:", err);
    } finally {
      setIsPostsLoading(false);
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

      const updateLikes = (list: PostType[]) =>
        list.map((p) => {
          if (p._id === postId) {
            const hasLiked = p.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.likes.filter((id) => id !== dbUser._id)
              : [...p.likes, dbUser._id];
            return { ...p, likes };
          }
          return p;
        });

      setPosts((prev) => updateLikes(prev));
      setLikedPosts((prev) => updateLikes(prev));
      setSavedPosts((prev) => updateLikes(prev));
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
      
      if (activeTab === "saved") {
        setSavedPosts((prev) => prev.filter((p) => p._id !== postId));
      } else {
        const updateSaved = (list: PostType[]) =>
          list.map((p) => {
            if (p._id === postId) {
              const savedBy = p.savedBy || [];
              const hasSaved = dbUser?._id ? savedBy.includes(dbUser._id) : false;
              const nextSavedBy = hasSaved
                ? savedBy.filter((id: string) => id !== dbUser?._id)
                : (dbUser?._id ? [...savedBy, dbUser._id] : savedBy);
              return { ...p, savedBy: nextSavedBy };
            }
            return p;
          });
        setPosts((prev) => updateSaved(prev));
        setLikedPosts((prev) => updateSaved(prev));
        setSavedPosts((prev) => updateSaved(prev));
      }
    } catch (err) {
      console.error("Error saving post:", err);
    }
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
            setLikedPosts((prev) => prev.filter((p) => p._id !== postId));
            setSavedPosts((prev) => prev.filter((p) => p._id !== postId));
            Alert.alert("Success", "Post deleted successfully");
          } catch (err) {
            console.error("Error deleting post:", err);
            Alert.alert("Error", "Failed to delete post");
          }
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          bio,
          location,
          profilePicture,
          bannerImage,
        }),
      });

      if (!response.ok) throw new Error("Failed to update profile");

      await syncDbUser();
      setEditModalVisible(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (err) {
      console.error("Error saving profile:", err);
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const pickProfilePicture = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Permission to access photos is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setIsSaving(true);
        const base64 = await convertUriToBase64(result.assets[0].uri);
        setProfilePicture(base64);
      } catch (err) {
        console.error("Failed to convert profile picture:", err);
        Alert.alert("Error", "Failed to process selected image.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const pickBannerImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Permission to access photos is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setIsSaving(true);
        const base64 = await convertUriToBase64(result.assets[0].uri);
        setBannerImage(base64);
      } catch (err) {
        console.error("Failed to convert banner image:", err);
        Alert.alert("Error", "Failed to process selected image.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)");
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

  if (dbLoading && !dbUser) {
    return (
      <TabScreen>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator size="large" color="#2b4afc" />
        </View>
      </TabScreen>
    );
  }

  const defaultBanner =
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";
  const defaultAvatar =
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

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
              {item.user?.location ? (
                <View className="bg-gray-100 px-1.5 py-0.5 rounded-md flex-row items-center">
                  <Feather name="map-pin" size={10} color="#657786" />
                  <Text className="text-[10px] text-gray-500 font-semibold ml-0.5" numberOfLines={1}>
                    {item.user.location}
                  </Text>
                </View>
              ) : null}
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
            {/* Comment Action */}
            <TouchableOpacity className="flex-row items-center gap-1.5 p-1">
              <Feather name="message-circle" size={17} color="#657786" />
              <Text className="text-gray-500 text-xs">{item.comments?.length || 0}</Text>
            </TouchableOpacity>

            {/* Repost Action */}
            <TouchableOpacity className="flex-row items-center gap-1.5 p-1">
              <Feather name="repeat" size={16} color="#657786" />
              <Text className="text-gray-500 text-xs">0</Text>
            </TouchableOpacity>

            {/* Like Action */}
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

            {/* Share Action */}
            <TouchableOpacity className="p-1">
              <Feather name="share-2" size={16} color="#657786" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const profileHeader = (
    <View className="bg-white">
      {/* 1. Cover Banner Image */}
      <Image
        source={{
          uri: dbUser?.bannerImage || defaultBanner,
        }}
        className="w-full h-36 bg-gray-200"
        resizeMode="cover"
      />

      {/* 2. Profile Details Block */}
      <View className="px-4 -mt-14 flex-row justify-between items-end">
        {/* Avatar Image overlapping banner */}
        <Image
          source={{
            uri: dbUser?.profilePicture || clerkUser?.imageUrl || defaultAvatar,
          }}
          className="w-24 h-24 rounded-full border-4 border-white bg-white"
        />

        {/* Action Buttons */}
        <View className="flex-row gap-2 mb-2">
          <TouchableOpacity
            onPress={() => setEditModalVisible(true)}
            className="px-4 py-1.5 rounded-full border border-gray-300 bg-white"
          >
            <Text className="text-gray-900 font-bold text-[14px]">Edit profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            className="p-2.5 rounded-full border border-gray-300 bg-white justify-center items-center"
          >
            <Feather name="log-out" size={15} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. User Identity Info */}
      <View className="px-4 mt-3">
        <Text className="text-2xl font-bold text-gray-900 leading-7">
          {dbUser ? `${dbUser.firstName} ${dbUser.lastName}`.trim() : clerkUser?.fullName || "User"}
        </Text>
        <Text className="text-gray-500 text-[15px]">
          @{dbUser?.username || clerkUser?.username || "username"}
        </Text>

        {/* Bio */}
        {dbUser?.bio ? (
          <Text className="text-gray-900 text-[15px] mt-3 leading-5">
            {dbUser.bio}
          </Text>
        ) : (
          <Text className="text-gray-400 text-[15px] mt-3 italic">
            No bio yet. Tap Edit Profile to add your bio!
          </Text>
        )}
      </View>

      {/* 4. Details (Location, Joined) */}
      <View className="px-4 mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
        {dbUser?.location ? (
          <View className="flex-row items-center">
            <Feather name="map-pin" size={14} color="#657786" />
            <Text className="text-gray-500 text-[14px] ml-1.5">{dbUser.location}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center">
          <Feather name="calendar" size={14} color="#657786" />
          <Text className="text-gray-500 text-[14px] ml-1.5">
            Joined {getFormattedJoinedDate(dbUser?.createdAt || clerkUser?.createdAt)}
          </Text>
        </View>
      </View>

      {/* 5. Follow Stats counts */}
      <View className="px-4 mt-3.5 flex-row gap-4 border-b border-gray-100 pb-3.5">
        <TouchableOpacity className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {dbUser?.following?.length || 0}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Following</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {dbUser?.followers?.length || 0}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Followers</Text>
        </TouchableOpacity>
        <View className="flex-row items-center">
          <Text className="font-bold text-gray-900 text-[14px]">
            {posts.length}
          </Text>
          <Text className="text-gray-500 text-[14px] ml-1">Posts</Text>
        </View>
      </View>

      {/* 6. Tabs selector */}
      <View className="flex-row border-b border-gray-100">
        <TouchableOpacity
          className="flex-1 py-3 items-center justify-center relative"
          onPress={() => setActiveTab("posts")}
        >
          <Text
            className={`font-bold text-[15px] ${
              activeTab === "posts" ? "text-gray-900" : "text-gray-500"
            }`}
          >
            Posts
          </Text>
          {activeTab === "posts" && (
            <View className="absolute bottom-0 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-3 items-center justify-center relative"
          onPress={() => setActiveTab("likes")}
        >
          <Text
            className={`font-bold text-[15px] ${
              activeTab === "likes" ? "text-gray-900" : "text-gray-500"
            }`}
          >
            Likes
          </Text>
          {activeTab === "likes" && (
            <View className="absolute bottom-0 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-3 items-center justify-center relative"
          onPress={() => setActiveTab("saved")}
        >
          <Text
            className={`font-bold text-[15px] ${
              activeTab === "saved" ? "text-gray-900" : "text-gray-500"
            }`}
          >
            Saved
          </Text>
          {activeTab === "saved" && (
            <View className="absolute bottom-0 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <TabScreen>
      <View className="flex-1 bg-white">
        {/* Posts/Likes List */}
        <FlatList
          data={activeTab === "posts" ? posts : activeTab === "likes" ? likedPosts : savedPosts}
          renderItem={renderPostItem}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={profileHeader}
          ListEmptyComponent={
            isPostsLoading ? (
              <View className="py-8 justify-center items-center">
                <ActivityIndicator size="small" color="#2b4afc" />
              </View>
            ) : (
              <View className="py-12 px-4 items-center justify-center">
                <Feather
                  name={activeTab === "posts" ? "edit-3" : activeTab === "likes" ? "heart" : "bookmark"}
                  size={36}
                  color="#657786"
                />
                <Text className="text-gray-500 font-bold text-base mt-3">
                  {activeTab === "posts"
                    ? "No posts yet"
                    : activeTab === "likes"
                    ? "No liked posts yet"
                    : "No saved posts yet"}
                </Text>
                <Text className="text-gray-400 text-sm text-center mt-1">
                  {activeTab === "posts"
                    ? "When you post updates, they will appear here."
                    : activeTab === "likes"
                    ? "Tap the heart icon on any post to add it to your likes."
                    : "Tap the bookmark icon on any post to save it for later."}
                </Text>
              </View>
            )
          }
          refreshing={isPostsLoading}
          onRefresh={activeTab === "posts" ? fetchUserPosts : activeTab === "likes" ? fetchLikedPosts : fetchSavedPosts}
          showsVerticalScrollIndicator={false}
        />

        {/* Edit Profile Modal */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl h-[85%] px-5 py-6 shadow-xl">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-6 pb-2 border-b border-gray-100">
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Text className="text-gray-500 text-base font-semibold">Cancel</Text>
                </TouchableOpacity>
                <Text className="text-lg font-bold text-gray-900">Edit Profile</Text>
                <TouchableOpacity onPress={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#2b4afc" />
                  ) : (
                    <Text className="text-blue-500 text-base font-bold">Save</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Form Scroll Container */}
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                <View className="gap-y-4 mb-8">
                  {/* First Name Input */}
                  <View>
                    <Text className="text-gray-600 font-semibold text-sm mb-1.5">First Name</Text>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="Enter your first name"
                      className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50"
                    />
                  </View>

                  {/* Last Name Input */}
                  <View>
                    <Text className="text-gray-600 font-semibold text-sm mb-1.5">Last Name</Text>
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Enter your last name"
                      className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50"
                    />
                  </View>

                  {/* Bio Input */}
                  <View>
                    <Text className="text-gray-600 font-semibold text-sm mb-1.5">Bio</Text>
                    <TextInput
                      value={bio}
                      onChangeText={setBio}
                      placeholder="Write something about yourself"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 h-24"
                    />
                  </View>

                  {/* Location Input */}
                  <View>
                    <Text className="text-gray-600 font-semibold text-sm mb-1.5">Location</Text>
                    <TextInput
                      value={location}
                      onChangeText={setLocation}
                      placeholder="e.g. San Francisco, CA"
                      className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50"
                    />
                  </View>

                  {/* Banner Image Picker */}
                  <View>
                    <Text className="text-gray-600 font-semibold text-sm mb-2">Banner Image</Text>
                    <TouchableOpacity
                      onPress={pickBannerImage}
                      className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
                    >
                      <Image
                        source={{ uri: bannerImage || defaultBanner }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                      <View className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <View className="bg-black/50 p-2.5 rounded-full">
                          <Feather name="camera" size={20} color="white" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Profile Picture Picker */}
                  <View className="items-center my-2">
                    <Text className="text-gray-600 font-semibold text-sm mb-2 self-start">Profile Picture</Text>
                    <TouchableOpacity
                      onPress={pickProfilePicture}
                      className="relative w-28 h-28 rounded-full overflow-hidden bg-gray-100 border-2 border-white shadow-md"
                    >
                      <Image
                        source={{ uri: profilePicture || defaultAvatar }}
                        className="w-full h-full"
                      />
                      <View className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <View className="bg-black/50 p-2 rounded-full">
                          <Feather name="camera" size={16} color="white" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </TabScreen>
  );
}
