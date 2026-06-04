import { Feather, FontAwesome } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter, useLocalSearchParams } from "expo-router";
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
  FlatList,
  Modal,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";

type SearchedUser = {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  isFollowing: boolean;
};

type CommentType = {
  _id: string;
  user: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  content: string;
  createdAt: string;
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
  savedBy?: string[];
  likes: string[];
  comments: CommentType[];
  repostOf?: PostType | null;
  reposts: string[];
  createdAt: string;
  type?: "discussion" | "alert" | "marketplace" | "event";
};

type ConversationUser = {
  _id: string;
  name: string;
  username: string;
  avatar: string;
};

type ConversationType = {
  id: string;
  user: ConversationUser;
};

type DiscoveryTrend = {
  id: string;
  title: string;
  activity: string;
  locality: string;
};

type DiscoveryPerson = {
  id: string;
  name: string;
  interests: string;
  locality: string;
  distance: string;
  avatar: string;
};

type DiscoveryCategory = {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
};

const defaultAvatar =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

const ACCENT = "#2B4AFC";

const discoveryTrends: DiscoveryTrend[] = [
  { id: "1", title: "Football tonight ⚽", activity: "1.9K people talking", locality: "Kharghar" },
  { id: "2", title: "Flatmate needed 🏠", activity: "640 active posts", locality: "Belapur" },
  { id: "3", title: "New cafe opened ☕", activity: "1.1K views in 1h", locality: "Vashi" },
  { id: "4", title: "IPL screening 🔥", activity: "3.4K engagements", locality: "Nerul" },
];

const discoveryPeople: DiscoveryPerson[] = [
  {
    id: "1",
    name: "Aarav Mehta",
    interests: "Football, Coffee",
    locality: "Kharghar",
    distance: "1.2 km",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face",
  },
  {
    id: "2",
    name: "Riya Shah",
    interests: "Gaming, Design",
    locality: "Belapur",
    distance: "2.4 km",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face",
  },
  {
    id: "3",
    name: "Kabir Nair",
    interests: "Startups, Fitness",
    locality: "Nerul",
    distance: "3.1 km",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face",
  },
];

const discoveryCategories: DiscoveryCategory[] = [
  { id: "1", icon: "zap", title: "Activities", subtitle: "Trending meetups" },
  { id: "2", icon: "shopping-bag", title: "Marketplace", subtitle: "Buy & sell local" },
  { id: "3", icon: "calendar", title: "Events", subtitle: "Tonight & this week" },
  { id: "4", icon: "activity", title: "Fitness", subtitle: "Runs and workouts" },
  { id: "5", icon: "coffee", title: "Food", subtitle: "Cafe buzz nearby" },
  { id: "6", icon: "monitor", title: "Gaming", subtitle: "Squads & LANs" },
  { id: "7", icon: "book-open", title: "Study Groups", subtitle: "Peers around you" },
];

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
                router.push(`/user/${username}`);
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

const SearchScreen = () => {
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<SearchedUser[]>([]);
  const [posts, setPosts] = useState<PostType[]>([]);
  const [communityPosts, setCommunityPosts] = useState<PostType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();
  const { dbUser } = useUserContext();
  const router = useRouter();

  const { q } = useLocalSearchParams<{ q?: string }>();

  // Comment Modal State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentingOnPost, setCommentingOnPost] = useState<PostType | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);

  // Share Modal State
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingPost, setSharingPost] = useState<PostType | null>(null);
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [shareSearchQuery, setShareSearchQuery] = useState("");
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);

  useEffect(() => {
    if (q) {
      setSearchText(q);
    }
  }, [q]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchText.trim()) {
        searchBackendUsers(searchText);
        searchBackendPosts(searchText);
      } else {
        setUsers([]);
        setPosts([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchText]);

  useEffect(() => {
    fetchCommunityPosts();
    const timer = setTimeout(() => setIsDiscoveryLoading(false), 850);
    return () => clearTimeout(timer);
  }, []);

  const fetchCommunityPosts = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts?feedType=nearby`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch community posts");
      const data = await response.json();
      setCommunityPosts(data.posts || []);
    } catch (error) {
      console.error("Error fetching community posts:", error);
    }
  };

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
      console.error("Error in search:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchBackendPosts = async (query: string) => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/search?q=${encodeURIComponent(query)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Post search failed");
      }

      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error("Error in post search:", error);
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

      const updatePostList = (prev: PostType[]) =>
        prev.map((p) => {
          if (p._id === postId) {
            const hasLiked = p.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.likes.filter((id) => id !== dbUser._id)
              : [...p.likes, dbUser._id];
            return { ...p, likes };
          }
          if (p.repostOf && p.repostOf._id === postId) {
            const hasLiked = p.repostOf.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.repostOf.likes.filter((id) => id !== dbUser._id)
              : [...p.repostOf.likes, dbUser._id];
            return { ...p, repostOf: { ...p.repostOf, likes } };
          }
          return p;
        });

      setPosts(updatePostList);
      setCommunityPosts(updatePostList);
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  const handleRepostPost = async (postId: string) => {
    if (!dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${postId}/repost`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to repost");

      const updatePostList = (prev: PostType[]) =>
        prev.map((p) => {
          if (p._id === postId) {
            const hasReposted = p.reposts.includes(dbUser._id);
            const reposts = hasReposted
              ? p.reposts.filter((id) => id !== dbUser._id)
              : [...p.reposts, dbUser._id];
            return { ...p, reposts };
          }
          if (p.repostOf && p.repostOf._id === postId) {
            const hasReposted = p.repostOf.reposts.includes(dbUser._id);
            const reposts = hasReposted
              ? p.repostOf.reposts.filter((id) => id !== dbUser._id)
              : [...p.repostOf.reposts, dbUser._id];
            return { ...p, repostOf: { ...p.repostOf, reposts } };
          }
          return p;
        });

      setPosts(updatePostList);
      setCommunityPosts(updatePostList);
    } catch (err) {
      console.error("Error reposting:", err);
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

      const updatePostList = (prev: PostType[]) =>
        prev.map((p) => {
          if (p._id === postId) {
            const savedBy = p.savedBy || [];
            const alreadySaved = savedBy.includes(dbUser._id);
            const nextSavedBy = alreadySaved
              ? savedBy.filter((id) => id !== dbUser._id)
              : [...savedBy, dbUser._id];
            return { ...p, savedBy: nextSavedBy };
          }
          if (p.repostOf && p.repostOf._id === postId) {
            const savedBy = p.repostOf.savedBy || [];
            const alreadySaved = savedBy.includes(dbUser._id);
            const nextSavedBy = alreadySaved
              ? savedBy.filter((id) => id !== dbUser._id)
              : [...savedBy, dbUser._id];
            return { ...p, repostOf: { ...p.repostOf, savedBy: nextSavedBy } };
          }
          return p;
        });

      setPosts(updatePostList);
      setCommunityPosts(updatePostList);
    } catch (err) {
      console.error("Error saving post:", err);
    }
  };

  const handleOpenCommentModal = (post: PostType) => {
    const targetPost = post.repostOf || post;
    setCommentingOnPost(targetPost);
    setCommentText("");
    setCommentModalVisible(true);
  };

  const handleCreateComment = async () => {
    if (!commentingOnPost || !commentText.trim()) return;

    try {
      setIsCommenting(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/comments/${commentingOnPost._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: commentText }),
      });

      if (!response.ok) throw new Error("Failed to comment");

      const data = await response.json();
      const newComment: CommentType = {
        _id: data.comment._id || Date.now().toString(),
        user: {
          _id: dbUser?._id || "",
          username: dbUser?.username || "me",
          firstName: dbUser?.firstName || "",
          lastName: dbUser?.lastName || "",
          profilePicture: dbUser?.profilePicture,
        },
        content: commentText,
        createdAt: new Date().toISOString(),
      };

      const updatePostList = (prev: PostType[]) =>
        prev.map((p) => {
          if (p._id === commentingOnPost._id) {
            return { ...p, comments: [newComment, ...p.comments] };
          }
          if (p.repostOf && p.repostOf._id === commentingOnPost._id) {
            return {
              ...p,
              repostOf: {
                ...p.repostOf,
                comments: [newComment, ...p.repostOf.comments],
              },
            };
          }
          return p;
        });

      setPosts(updatePostList);
      setCommunityPosts(updatePostList);

      setCommentText("");
      setCommentModalVisible(false);
    } catch (err) {
      console.error("Error posting comment:", err);
      Alert.alert("Error", "Failed to add comment");
    } finally {
      setIsCommenting(false);
    }
  };

  const handleOpenShareModal = async (post: PostType) => {
    const targetPost = post.repostOf || post;
    setSharingPost(targetPost);
    setSentUserIds(new Set());
    setShareSearchQuery("");
    setShareModalVisible(true);

    try {
      setIsShareLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Error fetching conversations for sharing:", err);
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleShareToUser = async (recipientId: string) => {
    if (!sharingPost) return;

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("sharedPost", sharingPost._id);
      formData.append("text", "Shared a post");

      const response = await fetch(`${API_URL}/api/messages/send/${recipientId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to share post");

      setSentUserIds((prev) => {
        const next = new Set(prev);
        next.add(recipientId);
        return next;
      });
    } catch (err) {
      console.error("Error sharing post:", err);
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

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case "alert":
        return <Text className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[11px] font-bold">🚨 ALERT</Text>;
      case "marketplace":
        return <Text className="bg-green-50 text-green-600 px-2 py-0.5 rounded text-[11px] font-bold">🛍️ MARKET</Text>;
      case "event":
        return <Text className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[11px] font-bold">📅 EVENT</Text>;
      default:
        return null;
    }
  };

  const renderPost = ({ item }: { item: PostType }) => {
    const isRepost = !!item.repostOf;
    const postData = item.repostOf || item;
    const originalUser = postData.user;
    const hasLiked = dbUser?._id ? postData.likes?.includes(dbUser._id) : false;
    const hasReposted = dbUser?._id ? postData.reposts?.includes(dbUser._id) : false;
    const isSaved = dbUser?._id ? postData.savedBy?.includes(dbUser._id) : false;

    if (!originalUser) return null;

    return (
      <View className="px-4 py-3.5 border-b border-gray-100 bg-white">
        {isRepost && (
          <View className="flex-row items-center ml-9 mb-1.5">
            <Feather name="repeat" size={13} color="#657786" />
            <Text className="text-gray-500 font-semibold text-[13px] ml-1.5">
              {item.user?.username === dbUser?.username ? "You reposted" : `@${item.user?.username} reposted`}
            </Text>
          </View>
        )}

        <View className="flex-row">
          <View className="items-center mr-3">
            <TouchableOpacity onPress={() => router.push(`/user/${originalUser.username}` as any)}>
              <Image
                source={{ uri: originalUser.profilePicture || defaultAvatar }}
                className="w-11 h-11 rounded-full bg-gray-100"
              />
            </TouchableOpacity>
            {postData.comments && postData.comments.length > 0 && (
              <View className="w-0.5 bg-gray-200 flex-1 my-1.5" />
            )}
          </View>

          <View className="flex-1">
            <View className="flex-row justify-between items-center">
              <TouchableOpacity
                onPress={() => router.push(`/user/${originalUser.username}` as any)}
                className="flex-row items-center flex-wrap gap-x-1.5 flex-1"
              >
                <Text className="font-bold text-gray-900 text-[15px]" numberOfLines={1}>
                  {`${originalUser.firstName || ""} ${originalUser.lastName || ""}`.trim() || originalUser.username}
                </Text>
                <Text className="text-gray-500 text-[14px]" numberOfLines={1}>
                  @{originalUser.username}
                </Text>
                {originalUser.location ? (
                  <>
                    <Text className="text-gray-400 text-[12px]">·</Text>
                    <Text className="text-[#2b4afc] text-[12px] font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                      {originalUser.location}
                    </Text>
                  </>
                ) : null}
                <Text className="text-gray-400 text-[14px]">·</Text>
                <Text className="text-gray-500 text-[14px]">
                  {getRelativeTime(postData.createdAt)}
                </Text>
              </TouchableOpacity>
              {getTypeBadge(postData.type)}
            </View>

            {renderFormattedContent(postData.content, router)}

            {renderPostImages(postData.images, postData.image)}

            <View className="flex-row justify-between items-center mt-3.5 pr-8">
              <TouchableOpacity onPress={() => handleOpenCommentModal(item)} className="flex-row items-center gap-1.5 p-1">
                <Feather name="message-circle" size={17} color="#657786" />
                <Text className="text-gray-500 text-xs">{postData.comments?.length || 0}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleRepostPost(postData._id)} className="flex-row items-center gap-1.5 p-1">
                <Feather name="repeat" size={16} color={hasReposted ? "#17bf63" : "#657786"} />
                <Text className={`text-xs ${hasReposted ? "text-[#17bf63] font-semibold" : "text-gray-500"}`}>
                  {postData.reposts?.length || 0}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleLikePost(postData._id)} className="flex-row items-center gap-1.5 p-1">
                <FontAwesome name={hasLiked ? "heart" : "heart-o"} size={16} color={hasLiked ? "#e0245e" : "#657786"} />
                <Text className={`text-xs ${hasLiked ? "text-[#e0245e] font-semibold" : "text-gray-500"}`}>
                  {postData.likes?.length || 0}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleOpenShareModal(item)} className="p-1">
                <Feather name="share-2" size={16} color="#657786" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleSavePost(postData._id)} className="p-1">
                <FontAwesome
                  name={isSaved ? "bookmark" : "bookmark-o"}
                  size={16}
                  color={isSaved ? "#2b4afc" : "#657786"}
                />
              </TouchableOpacity>
            </View>

            {postData.comments && postData.comments.length > 0 && (
              <View className="mt-2">
                {postData.comments.slice(0, 3).map((comment, index) => (
                  <View key={comment._id} className="flex-row mt-2.5 items-start">
                    <View className="items-center mr-2.5">
                      <TouchableOpacity onPress={() => router.push(`/user/${comment.user.username}` as any)}>
                        <Image
                          source={{ uri: comment.user?.profilePicture || defaultAvatar }}
                          className="w-7 h-7 rounded-full bg-gray-100"
                        />
                      </TouchableOpacity>
                      {index < Math.min(postData.comments.length, 3) - 1 && (
                        <View className="w-0.5 bg-gray-200 flex-1 my-1" />
                      )}
                    </View>
                    <View className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                      <View className="flex-row items-center flex-wrap gap-x-1.5">
                        <Text className="font-semibold text-gray-900 text-xs">
                          {`${comment.user?.firstName || ""} ${comment.user?.lastName || ""}`.trim() || comment.user?.username}
                        </Text>
                        <Text className="text-gray-500 text-[10px]">@{comment.user?.username}</Text>
                        <Text className="text-gray-400 text-[10px]">·</Text>
                        <Text className="text-gray-500 text-[10px]">{getRelativeTime(comment.createdAt)}</Text>
                      </View>
                      <Text className="text-gray-800 text-[13px] mt-0.5 leading-4">{comment.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const filteredConversations = conversations.filter((c) =>
    c.user.name.toLowerCase().includes(shareSearchQuery.toLowerCase()) ||
    c.user.username.toLowerCase().includes(shareSearchQuery.toLowerCase())
  );

  const discoveryPosts = communityPosts.slice(0, 5);

  const renderDiscoverySkeleton = () => (
    <View className="px-4 pt-4">
      {[1, 2, 3].map((item) => (
        <View key={item} className="mb-3 p-3 rounded-2xl border border-gray-100 bg-gray-50">
          <View className="flex-row items-center">
            <View className="h-10 w-10 rounded-full bg-gray-200" />
            <View className="ml-3 flex-1">
              <View className="h-3.5 w-28 rounded bg-gray-200" />
              <View className="h-3 w-20 mt-2 rounded bg-gray-100" />
            </View>
          </View>
          <View className="h-3.5 w-full mt-3 rounded bg-gray-200" />
          <View className="h-3.5 w-3/4 mt-2 rounded bg-gray-200" />
          <View className="h-40 w-full mt-3 rounded-xl bg-gray-200" />
        </View>
      ))}
    </View>
  );

  const renderDiscoveryPostCard = (item: PostType) => {
    const postData = item.repostOf || item;
    const user = postData.user;
    if (!user) return null;

    return (
      <View key={item._id} className="mb-3 p-3 rounded-2xl border border-gray-100 bg-white shadow-sm">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <Image source={{ uri: user.profilePicture || defaultAvatar }} className="h-10 w-10 rounded-full bg-gray-100" />
            <View className="ml-2.5 flex-1">
              <Text className="text-gray-900 text-[14px] font-semibold" numberOfLines={1}>
                {`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username}
              </Text>
              <Text className="text-gray-500 text-[12px]" numberOfLines={1}>
                @{user.username} · {user.location || "Nearby"} · {getRelativeTime(postData.createdAt)}
              </Text>
            </View>
          </View>
          <TouchableOpacity className="p-1.5 rounded-full bg-gray-50">
            <Feather name="more-horizontal" size={14} color="#657786" />
          </TouchableOpacity>
        </View>

        <Text className="text-gray-800 text-[14px] leading-5 mt-2" numberOfLines={3}>
          {postData.content}
        </Text>

        {postData.image || (postData.images && postData.images.length > 0) ? (
          <Image
            source={{ uri: (postData.images && postData.images[0]) || postData.image }}
            className="w-full h-40 rounded-xl mt-3 bg-gray-100"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-28 rounded-xl mt-3 border border-gray-100 bg-gray-50 items-center justify-center">
            <Text className="text-gray-500 text-xs">Local buzz preview</Text>
          </View>
        )}

        <View className="flex-row items-center mt-3 justify-between px-1">
          <View className="flex-row items-center">
            <Feather name="heart" size={15} color="#e0245e" />
            <Text className="text-gray-600 text-xs ml-1">{postData.likes?.length || 0}</Text>
          </View>
          <View className="flex-row items-center">
            <Feather name="message-circle" size={15} color={ACCENT} />
            <Text className="text-gray-600 text-xs ml-1">{postData.comments?.length || 0}</Text>
          </View>
          <View className="flex-row items-center">
            <Feather name="map-pin" size={15} color="#2b4afc" />
            <Text className="text-gray-600 text-xs ml-1">{user.location || "Local"}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER WITH SEARCH BAR */}
      <View className="px-4 pt-3 pb-3 border-b border-gray-100 bg-white">
        <View className="flex-row items-center rounded-full px-4 py-3 bg-gray-50 border border-gray-200">
          <Feather name="search" size={20} color="#657786" />
          <TextInput
            placeholder="What's happening nearby?"
            className="flex-1 ml-3 text-base text-gray-900"
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
          <TouchableOpacity
            onPress={() => {
              if (dbUser?.username) {
                router.push(`/user/${dbUser.username}` as any);
              }
            }}
            className="ml-3"
          >
            <Image source={{ uri: dbUser?.profilePicture || defaultAvatar }} className="h-8 w-8 rounded-full border border-gray-200" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1">
        {isLoading ? (
          <View className="py-8 justify-center items-center">
            <ActivityIndicator size="small" color={ACCENT} />
          </View>
        ) : searchText.trim() ? (
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {users.length > 0 && (
              <View className="px-4 pt-4">
                <Text className="text-gray-900 text-base font-bold mb-2">People</Text>
                {users.map((user) => (
                  <View key={user._id} className="flex-row items-center justify-between py-3 px-2.5 mb-2 rounded-2xl border border-gray-100 bg-white">
                    <View className="flex-row items-center flex-1 mr-3">
                      <TouchableOpacity onPress={() => router.push(`/user/${user.username}` as any)}>
                        <Image
                          source={{ uri: user.profilePicture || defaultAvatar }}
                          className="size-12 rounded-full mr-3 bg-gray-100"
                        />
                      </TouchableOpacity>
                      <View className="flex-1">
                        <TouchableOpacity onPress={() => router.push(`/user/${user.username}` as any)}>
                          <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>
                            {`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username}
                          </Text>
                          <Text className="text-gray-500 text-sm" numberOfLines={1}>
                            @{user.username}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity onPress={() => handleMessageUser(user)} className="p-2 bg-blue-50 rounded-full">
                        <Feather name="mail" size={18} color={ACCENT} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleFollowToggle(user)}
                        className={`px-4 py-1.5 rounded-full border ${
                          user.isFollowing ? "bg-white border-gray-300" : "bg-[#2b4afc] border-[#2b4afc]"
                        }`}
                      >
                        <Text className={`text-sm font-semibold ${user.isFollowing ? "text-gray-700" : "text-white"}`}>
                          {user.isFollowing ? "Following" : "Follow"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {posts.length > 0 ? (
              <View>
                {users.length > 0 && (
                  <Text className="text-gray-900 text-base font-bold px-4 mb-1">Posts</Text>
                )}
                {posts.map((post) => (
                  <View key={post._id}>{renderPost({ item: post })}</View>
                ))}
              </View>
            ) : users.length === 0 ? (
              <Text className="text-gray-500 text-center py-10">No results found</Text>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {isDiscoveryLoading ? (
              renderDiscoverySkeleton()
            ) : (
              <View className="px-4 pt-4 pb-8">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-900 text-[18px] font-bold">Trending Nearby</Text>
                  <TouchableOpacity>
                    <Text className="text-[#2b4afc] text-xs font-semibold">See all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
                  {discoveryTrends.map((trend) => (
                    <TouchableOpacity
                      key={trend.id}
                      onPress={() => setSearchText(trend.title.replace(/[^\w\s#@]/g, "").trim())}
                      className="w-64 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm"
                    >
                      <Text className="text-gray-500 text-[11px]">Trending in {trend.locality}</Text>
                      <Text className="text-gray-900 text-[16px] font-bold mt-1.5">{trend.title}</Text>
                      <View className="flex-row items-center justify-between mt-2.5">
                        <Text className="text-gray-600 text-[12px]">{trend.activity}</Text>
                        <View className="px-2 py-1 rounded-full bg-blue-50 border border-blue-100">
                          <Text className="text-[#2b4afc] text-[10px] font-semibold">{trend.locality}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View className="mt-1 mb-2 flex-row items-center justify-between">
                  <Text className="text-gray-900 text-[18px] font-bold">Live Local Posts</Text>
                  <TouchableOpacity onPress={fetchCommunityPosts}>
                    <Text className="text-[#2b4afc] text-xs font-semibold">Refresh</Text>
                  </TouchableOpacity>
                </View>
                {discoveryPosts.length > 0 ? (
                  discoveryPosts.map((post) => renderDiscoveryPostCard(post))
                ) : (
                  <View className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mb-3">
                    <Text className="text-gray-800 font-semibold">No fresh local posts yet</Text>
                    <Text className="text-gray-500 text-xs mt-1">Be the first to share what is happening around you.</Text>
                  </View>
                )}

                <View className="mt-1 mb-2 flex-row items-center justify-between">
                  <Text className="text-gray-900 text-[18px] font-bold">People Nearby</Text>
                  <TouchableOpacity>
                    <Text className="text-[#2b4afc] text-xs font-semibold">Explore</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
                  {discoveryPeople.map((person) => (
                    <View key={person.id} className="w-44 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                      <Image source={{ uri: person.avatar }} className="h-12 w-12 rounded-full bg-gray-100" />
                      <Text className="text-gray-900 text-sm font-semibold mt-2" numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text className="text-gray-500 text-[11px] mt-1" numberOfLines={1}>
                        {person.interests}
                      </Text>
                      <Text className="text-gray-500 text-[11px] mt-1" numberOfLines={1}>
                        {person.locality} · {person.distance}
                      </Text>
                      <TouchableOpacity className="mt-2.5 py-1.5 rounded-full bg-[#2b4afc] items-center">
                        <Text className="text-white text-xs font-semibold">Follow</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <View className="mt-1 mb-2">
                  <Text className="text-gray-900 text-[18px] font-bold">Discover Categories</Text>
                </View>
                <View className="flex-row flex-wrap justify-between gap-y-2">
                  {discoveryCategories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      className="w-[48.5%] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                    >
                      <View className="h-8 w-8 rounded-full bg-blue-50 items-center justify-center">
                        <Feather name={category.icon} size={15} color={ACCENT} />
                      </View>
                      <Text className="text-gray-900 text-[14px] font-semibold mt-2">{category.title}</Text>
                      <Text className="text-gray-500 text-[11px] mt-1">{category.subtitle}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* COMMENT MODAL */}
      <Modal visible={commentModalVisible} animationType="slide" presentationStyle="pageSheet">
        {commentingOnPost && (
          <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                <Text className="text-gray-600 text-base font-semibold">Cancel</Text>
              </TouchableOpacity>
              <Text className="font-bold text-gray-900 text-base">Reply</Text>
              <TouchableOpacity
                onPress={handleCreateComment}
                disabled={isCommenting || !commentText.trim()}
                className={`px-4 py-1.5 rounded-full ${commentText.trim() ? "bg-[#2b4afc]" : "bg-gray-100"}`}
              >
                {isCommenting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className={`font-bold text-sm ${commentText.trim() ? "text-white" : "text-gray-400"}`}>
                    Reply
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View className="p-4 flex-row border-b border-gray-50 bg-gray-50/50">
              <Image
                source={{ uri: commentingOnPost.user?.profilePicture || defaultAvatar }}
                className="w-10 h-10 rounded-full mr-3 bg-gray-100"
              />
              <View className="flex-1">
                <Text className="font-bold text-gray-900 text-sm">
                  {`${commentingOnPost.user?.firstName || ""} ${commentingOnPost.user?.lastName || ""}`.trim() || commentingOnPost.user?.username}
                </Text>
                <Text className="text-gray-500 text-xs mt-0.5">Replying to @{commentingOnPost.user?.username}</Text>
                <Text className="text-gray-700 text-[14px] mt-2" numberOfLines={3}>{commentingOnPost.content}</Text>
              </View>
            </View>

            <View className="p-4 flex-row flex-1">
              <Image
                source={{ uri: dbUser?.profilePicture || defaultAvatar }}
                className="w-10 h-10 rounded-full mr-3 bg-gray-100"
              />
              <TextInput
                placeholder="Post your reply..."
                placeholderTextColor="#657786"
                className="flex-1 text-base text-gray-900 pt-1 h-32"
                multiline
                autoFocus
                value={commentText}
                onChangeText={setCommentText}
              />
            </View>
          </SafeAreaView>
        )}
      </Modal>

      {/* SHARE POST (DM) MODAL */}
      <Modal visible={shareModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <TouchableOpacity onPress={() => setShareModalVisible(false)}>
              <Text className="text-gray-600 text-base font-semibold">Done</Text>
            </TouchableOpacity>
            <Text className="font-bold text-gray-900 text-base">Send in message</Text>
            <View className="w-10" />
          </View>

          <View className="px-4 py-2.5 border-b border-gray-100">
            <View className="flex-row items-center bg-gray-100 rounded-full px-3.5 py-2">
              <Feather name="search" size={16} color="#657786" />
              <TextInput
                placeholder="Search people..."
                placeholderTextColor="#657786"
                className="flex-1 ml-2 text-sm text-gray-900"
                value={shareSearchQuery}
                onChangeText={setShareSearchQuery}
                autoCapitalize="none"
              />
            </View>
          </View>

          {isShareLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              className="flex-1"
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => {
                const isSent = sentUserIds.has(item.user._id);
                return (
                  <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
                    <View className="flex-row items-center flex-1 mr-3">
                      <Image source={{ uri: item.user.avatar || defaultAvatar }} className="w-11 h-11 rounded-full mr-3 bg-gray-100" />
                      <View className="flex-1">
                        <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>{item.user.name}</Text>
                        <Text className="text-gray-500 text-sm" numberOfLines={1}>@{item.user.username}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleShareToUser(item.user._id)}
                      disabled={isSent}
                      className={`px-4 py-1.5 rounded-full ${isSent ? "bg-gray-100" : "bg-[#2b4afc]"}`}
                    >
                      <Text className={`text-sm font-bold ${isSent ? "text-gray-400" : "text-white"}`}>{isSent ? "Sent" : "Send"}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={<View className="py-20 items-center justify-center"><Text className="text-gray-500">No conversations found</Text></View>}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default SearchScreen;