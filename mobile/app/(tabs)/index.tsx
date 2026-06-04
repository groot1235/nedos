import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";

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

type PollOption = {
  optionText: string;
  votes: string[];
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
  video?: string;
  savedBy?: string[];
  likes: string[];
  comments: CommentType[];
  repostOf?: PostType | null;
  reposts: string[];
  createdAt: string;
  type?: "discussion" | "alert" | "marketplace" | "event" | "poll";
  poll?: {
    question: string;
    options: PollOption[];
    expiresAt: string;
  } | null;
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

const defaultAvatar =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

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

export default function HomeScreen() {
  const { getToken } = useAuth();
  const { dbUser, isLoading: dbLoading, syncDbUser } = useUserContext();
  const router = useRouter();

  // Feed State
  const [posts, setPosts] = useState<PostType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const LIMIT = 10;

  // Compose State
  const [composerText, setComposerText] = useState("");
  const [selectedImageUris, setSelectedImageUris] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);

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
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<Set<string>>(new Set());
  const [isSendingShare, setIsSendingShare] = useState(false);

  const toggleShareUserSelection = (userId: string) => {
    setSelectedShareUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSendSeparately = async () => {
    if (!sharingPost || selectedShareUserIds.size === 0) return;
    setIsSendingShare(true);
    try {
      const token = await getToken();
      await Promise.all(
        Array.from(selectedShareUserIds).map(async (recipientId) => {
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
        })
      );
      Alert.alert("Success", "Post shared successfully!");
      setShareModalVisible(false);
    } catch (err) {
      console.error("Error sharing post:", err);
      Alert.alert("Error", "Failed to share post with some contacts.");
    } finally {
      setIsSendingShare(false);
    }
  };

  useEffect(() => {
    fetchFeed(true);
  }, []);

  const fetchFeed = async (reset = false) => {
    if (isFetchingMore && !reset) return;

    try {
      if (reset) {
        setIsLoading(true);
        setHasMore(true);
      } else {
        setIsFetchingMore(true);
      }

      const token = await getToken();
      const currentSkip = reset ? 0 : skip;
      const response = await fetch(`${API_URL}/api/posts?limit=${LIMIT}&skip=${currentSkip}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch posts");
      const data = await response.json();
      const newPosts = data.posts || [];

      if (reset) {
        setPosts(newPosts);
        setSkip(newPosts.length);
      } else {
        setPosts((prev) => {
          // Prevent duplicates by checking if the post ID is already present
          const existingIds = new Set(prev.map((p: PostType) => p._id));
          const filteredNew = newPosts.filter((p: PostType) => !existingIds.has(p._id));
          return [...prev, ...filteredNew];
        });
        setSkip((prev) => prev + newPosts.length);
      }

      if (newPosts.length < LIMIT) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error fetching feed:", err);
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts?limit=${LIMIT}&skip=0`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const newPosts = data.posts || [];
        setPosts(newPosts);
        setSkip(newPosts.length);
        setHasMore(newPosts.length === LIMIT);
      }
    } catch (err) {
      console.error("Error refreshing feed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBlockUser = async (targetUserId: string, targetUsername: string) => {
    Alert.alert(
      "Block User",
      `Are you sure you want to block @${targetUsername}? You will no longer see their posts or be able to exchange messages.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/api/users/block/${targetUserId}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!response.ok) throw new Error("Failed to block user");

              await syncDbUser();
              Alert.alert("Success", `@${targetUsername} has been blocked.`);
              fetchFeed(true); // reload feed from scratch
            } catch (error) {
              console.error("Error blocking user:", error);
              Alert.alert("Error", "Failed to block user. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleVotePoll = async (postId: string, optionText: string) => {
    if (!dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${postId}/poll/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ optionText }),
      });

      if (!response.ok) throw new Error("Failed to vote");
      const data = await response.json();

      setPosts((prev) =>
        prev.map((p) => {
          if (p._id === postId) {
            return data.post;
          }
          if (p.repostOf && p.repostOf._id === postId) {
            return { ...p, repostOf: data.post };
          }
          return p;
        })
      );
    } catch (err) {
      console.error("Error voting on poll in feed:", err);
      Alert.alert("Vote Failed", "Failed to cast vote. Try again.");
    }
  };

  const handleReportDialog = (postId: string | null, type: "post" | "user", reportedUserId: string) => {
    Alert.alert(
      "Report Content",
      "Why are you reporting this?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Spam", onPress: () => submitReport(postId, type, reportedUserId, "spam") },
        { text: "Harassment", onPress: () => submitReport(postId, type, reportedUserId, "harassment") },
        { text: "Inappropriate Content", onPress: () => submitReport(postId, type, reportedUserId, "inappropriate") },
        { text: "Other", onPress: () => submitReport(postId, type, reportedUserId, "other") },
      ]
    );
  };

  const submitReport = async (postId: string | null, type: "post" | "user", reportedUserId: string, reason: string) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportedUser: reportedUserId,
          reportedPost: postId,
          reason,
          description: `User reported this ${type} for ${reason} via mobile interface.`,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit report");
      Alert.alert("Report Submitted", "Thank you. Our moderation team will review this content.");
    } catch (error) {
      console.error("Error submitting report:", error);
      Alert.alert("Error", "Could not submit report. Check your connection.");
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Permission to access photos is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUris = result.assets.map(asset => asset.uri);
      setSelectedImageUris((prev) => {
        const combined = [...prev, ...newUris];
        return combined.slice(0, 5); // limit to 5 images
      });
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
      const data = await response.json();

      // Optimistically update feed
      setPosts((prev) =>
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
        })
      );
    } catch (err) {
      console.error("Error saving post:", err);
    }
  };

  const handleCreatePost = async () => {
    if (!composerText.trim() && selectedImageUris.length === 0) {
      Alert.alert("Error", "Post must contain either text or an image");
      return;
    }

    try {
      setIsPosting(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append("content", composerText);

      selectedImageUris.forEach((uri, idx) => {
        const filename = uri.split("/").pop() || `image_${idx}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        formData.append("images", {
          uri,
          name: filename,
          type,
        } as any);
      });

      const response = await fetch(`${API_URL}/api/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to create post");

      setComposerText("");
      setSelectedImageUris([]);
      // Re-fetch feed to get latest
      await handleRefresh();
    } catch (err) {
      console.error("Error creating post:", err);
      Alert.alert("Error", "Failed to create post");
    } finally {
      setIsPosting(false);
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

      // Optimistically update feed
      setPosts((prev) =>
        prev.map((p) => {
          // If this post is target, update it
          if (p._id === postId) {
            const hasLiked = p.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.likes.filter((id) => id !== dbUser._id)
              : [...p.likes, dbUser._id];
            return { ...p, likes };
          }
          // If this post is a repost of the target, update its nested repostOf as well
          if (p.repostOf && p.repostOf._id === postId) {
            const hasLiked = p.repostOf.likes.includes(dbUser._id);
            const likes = hasLiked
              ? p.repostOf.likes.filter((id) => id !== dbUser._id)
              : [...p.repostOf.likes, dbUser._id];
            return { ...p, repostOf: { ...p.repostOf, likes } };
          }
          return p;
        })
      );
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

      const data = await response.json();
      
      // Update UI state
      setPosts((prev) =>
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
        })
      );

      // Trigger refresh to bring the new repost into the timeline if created
      if (data.reposted) {
        handleRefresh();
      }
    } catch (err) {
      console.error("Error reposting:", err);
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
      
      // Update the comments in the local feed post
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

      setPosts((prev) =>
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
        })
      );

      setCommentText("");
      setCommentModalVisible(false);
    } catch (err) {
      console.error("Error posting comment:", err);
      Alert.alert("Error", "Failed to add comment");
    } finally {
      setIsCommenting(false);
    }
  };

  // Open Direct Message Sharing Modal
  const handleOpenShareModal = async (post: PostType) => {
    const targetPost = post.repostOf || post;
    setSharingPost(targetPost);
    setSelectedShareUserIds(new Set());
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

  // Send Direct Message containing the post reference
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
      console.error("Error sharing post via DM:", err);
      Alert.alert("Error", "Failed to share post");
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

  const renderPost = ({ item }: { item: PostType }) => {
    const isRepost = !!item.repostOf;
    const postData = item.repostOf || item; // Render original content
    const originalUser = postData.user;
    const isOwnPost = originalUser?.username === dbUser?.username;
    const hasLiked = dbUser?._id ? postData.likes?.includes(dbUser._id) : false;
    const hasReposted = dbUser?._id ? postData.reposts?.includes(dbUser._id) : false;
    const isSaved = dbUser?._id ? postData.savedBy?.includes(dbUser._id) : false;

    if (!originalUser) return null; // If user missing, skip rendering

    return (
      <TouchableOpacity
        onPress={() => router.push(`/post/${postData._id}` as any)}
        activeOpacity={0.95}
        className="px-4 py-3.5 border-b border-gray-100 bg-white"
      >
        {/* Repost Header Info */}
        {isRepost && (
          <View className="flex-row items-center ml-9 mb-1.5">
            <Feather name="repeat" size={13} color="#657786" />
            <Text className="text-gray-500 font-semibold text-[13px] ml-1.5">
              {item.user?.username === dbUser?.username
                ? "You reposted"
                : `@${item.user?.username} reposted`}
            </Text>
          </View>
        )}

        {/* Main Post Content Area */}
        <View className="flex-row">
          {/* Avatar and Thread Connector */}
          <View className="items-center mr-3">
            <TouchableOpacity
              onPress={() => {
                router.push(`/user/${originalUser.username}` as any);
              }}
            >
              <Image
                source={{
                  uri: originalUser.profilePicture || defaultAvatar,
                }}
                className="w-11 h-11 rounded-full bg-gray-100"
              />
            </TouchableOpacity>
            {postData.comments && postData.comments.length > 0 && (
              <View className="w-0.5 bg-gray-200 flex-1 my-1.5" />
            )}
          </View>

          {/* Right Column: User details, content, actions, comments */}
          <View className="flex-1">
            {/* User row */}
            <View className="flex-row justify-between items-center">
              <TouchableOpacity
                onPress={() => {
                  router.push(`/user/${originalUser.username}` as any);
                }}
                className="flex-row items-center flex-wrap gap-x-1.5 flex-1"
              >
                <Text className="font-bold text-gray-900 text-[15px]" numberOfLines={1}>
                  {`${originalUser.firstName || ""} ${originalUser.lastName || ""}`.trim() ||
                    originalUser.username}
                </Text>
                {originalUser.location ? (
                  <View className="bg-gray-100 px-1.5 py-0.5 rounded-md flex-row items-center">
                    <Feather name="map-pin" size={10} color="#657786" />
                    <Text className="text-[10px] text-gray-500 font-semibold ml-0.5" numberOfLines={1}>
                      {originalUser.location}
                    </Text>
                  </View>
                ) : null}
                <Text className="text-gray-500 text-[14px]" numberOfLines={1}>
                  @{originalUser.username}
                </Text>
                <Text className="text-gray-400 text-[14px]">·</Text>
                <Text className="text-gray-500 text-[14px]">
                  {getRelativeTime(postData.createdAt)}
                </Text>
              </TouchableOpacity>

              {!isOwnPost && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      "Options",
                      "Choose an action",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Block User",
                          style: "destructive",
                          onPress: () => handleBlockUser(originalUser._id, originalUser.username),
                        },
                        {
                          text: "Report Post",
                          onPress: () => handleReportDialog(postData._id, "post", originalUser._id),
                        },
                        {
                          text: "Report User",
                          onPress: () => handleReportDialog(null, "user", originalUser._id),
                        },
                      ]
                    );
                  }}
                  className="p-1"
                >
                  <Feather name="more-horizontal" size={18} color="#657786" />
                </TouchableOpacity>
              )}
            </View>

            {/* Post text */}
            {renderFormattedContent(postData.content, router)}

            {/* Post Images Grid / Collage */}
            {renderPostImages(postData.images, postData.image)}

            {/* Video Player */}
            {postData.video ? (
              <View className="mt-3 rounded-2xl overflow-hidden bg-black shadow-sm">
                <Video
                  source={{ uri: postData.video }}
                  rate={1.0}
                  volume={1.0}
                  isMuted={false}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                  isLooping
                  useNativeControls
                  style={{ width: "100%", height: 180 }}
                />
              </View>
            ) : null}

            {/* Poll Card */}
            {postData.type === "poll" && postData.poll ? (
              <View className="mt-3 bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <Text className="text-gray-900 font-bold text-[14px] mb-2 leading-5">
                  {postData.poll.question}
                </Text>
                {(() => {
                  const totalVotes = postData.poll.options.reduce((acc, opt) => acc + opt.votes.length, 0);
                  const isExpired = new Date(postData.poll.expiresAt).getTime() < Date.now();
                  const hasVoted = postData.poll.options.some((opt) =>
                    dbUser ? opt.votes.includes(dbUser._id) : false
                  );
                  const showResults = hasVoted || isExpired;

                  return (
                    <View>
                      {postData.poll.options.map((option, index) => {
                        const optionVoteCount = option.votes.length;
                        const percentage = totalVotes > 0 ? Math.round((optionVoteCount / totalVotes) * 100) : 0;
                        const userVotedForThis = dbUser ? option.votes.includes(dbUser._id) : false;

                        if (showResults) {
                          return (
                            <View
                              key={index}
                              className={`relative flex-row items-center justify-between p-3 mb-2 rounded-xl border ${
                                userVotedForThis ? "border-[#2b4afc] bg-white" : "border-gray-200 bg-white"
                              } overflow-hidden`}
                            >
                              <View
                                className="absolute left-0 top-0 bottom-0 bg-[#2b4afc]/10"
                                style={{ width: `${percentage}%` }}
                              />
                              <Text className={`text-xs z-10 ${userVotedForThis ? "text-[#2b4afc] font-bold" : "text-gray-700"}`}>
                                {option.optionText}
                              </Text>
                              <Text className="text-gray-500 text-[10px] font-bold z-10">
                                {percentage}%
                              </Text>
                            </View>
                          );
                        } else {
                          return (
                            <TouchableOpacity
                              key={index}
                              onPress={() => handleVotePoll(postData._id, option.optionText)}
                              className="w-full bg-white border border-gray-200 p-3 rounded-xl flex-row items-center justify-center mb-2 shadow-sm"
                            >
                              <Text className="text-gray-700 font-semibold text-xs">
                                {option.optionText}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                      })}
                      <View className="flex-row items-center justify-between mt-1.5">
                        <Text className="text-gray-400 text-[10px]">
                          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
                        </Text>
                        <Text className="text-gray-400 text-[10px]">
                          {isExpired ? "Closed" : "Active"}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            ) : null}

            {/* Twitter-like action buttons */}
            <View className="flex-row justify-between items-center mt-3.5 pr-8">
              {/* Comment Button */}
              <TouchableOpacity
                onPress={() => handleOpenCommentModal(item)}
                className="flex-row items-center gap-1.5 p-1"
              >
                <Feather name="message-circle" size={17} color="#657786" />
                <Text className="text-gray-500 text-xs">
                  {postData.comments?.length || 0}
                </Text>
              </TouchableOpacity>

              {/* Repost Button */}
              <TouchableOpacity
                onPress={() => handleRepostPost(postData._id)}
                className="flex-row items-center gap-1.5 p-1"
              >
                <Feather
                  name="repeat"
                  size={16}
                  color={hasReposted ? "#17bf63" : "#657786"}
                />
                <Text
                  className={`text-xs ${
                    hasReposted ? "text-[#17bf63] font-semibold" : "text-gray-500"
                  }`}
                >
                  {postData.reposts?.length || 0}
                </Text>
              </TouchableOpacity>

              {/* Like Button */}
              <TouchableOpacity
                onPress={() => handleLikePost(postData._id)}
                className="flex-row items-center gap-1.5 p-1"
              >
                <FontAwesome
                  name={hasLiked ? "heart" : "heart-o"}
                  size={16}
                  color={hasLiked ? "#e0245e" : "#657786"}
                />
                <Text
                  className={`text-xs ${
                    hasLiked ? "text-[#e0245e] font-semibold" : "text-gray-500"
                  }`}
                >
                  {postData.likes?.length || 0}
                </Text>
              </TouchableOpacity>

              {/* Save/Bookmark Button */}
              <TouchableOpacity
                onPress={() => handleSavePost(postData._id)}
                className="p-1"
              >
                <FontAwesome
                  name={isSaved ? "bookmark" : "bookmark-o"}
                  size={16}
                  color={isSaved ? "#2b4afc" : "#657786"}
                />
              </TouchableOpacity>

              {/* Share Button */}
              <TouchableOpacity
                onPress={() => handleOpenShareModal(item)}
                className="p-1"
              >
                <Feather name="share-2" size={16} color="#657786" />
              </TouchableOpacity>
            </View>

            {/* Threaded Comments */}
            {postData.comments && postData.comments.length > 0 && (
              <View className="mt-2">
                {postData.comments.slice(0, 3).map((comment, index) => (
                  <View key={comment._id} className="flex-row mt-2.5 items-start">
                    {/* Comment Avatar & Vertical Line */}
                    <View className="items-center mr-2.5">
                      <TouchableOpacity
                        onPress={() => router.push(`/user/${comment.user.username}` as any)}
                      >
                        <Image
                          source={{ uri: comment.user?.profilePicture || defaultAvatar }}
                          className="w-7 h-7 rounded-full bg-gray-100"
                        />
                      </TouchableOpacity>
                      {index < Math.min(postData.comments.length, 3) - 1 && (
                        <View className="w-0.5 bg-gray-200 flex-1 my-1" />
                      )}
                    </View>

                    {/* Comment Text Container */}
                    <View className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                      <View className="flex-row items-center flex-wrap gap-x-1.5">
                        <Text className="font-semibold text-gray-900 text-xs">
                          {`${comment.user?.firstName || ""} ${comment.user?.lastName || ""}`.trim() ||
                            comment.user?.username}
                        </Text>
                        <Text className="text-gray-500 text-[10px]">
                          @{comment.user?.username}
                        </Text>
                        <Text className="text-gray-400 text-[10px]">·</Text>
                        <Text className="text-gray-500 text-[10px]">
                          {getRelativeTime(comment.createdAt)}
                        </Text>
                      </View>
                      <Text className="text-gray-800 text-[13px] mt-0.5 leading-4">
                        {comment.content}
                      </Text>
                    </View>
                  </View>
                ))}

                {postData.comments.length > 3 && (
                  <TouchableOpacity
                    onPress={() => handleOpenCommentModal(item)}
                    className="mt-2.5 ml-9"
                  >
                    <Text className="text-blue-500 text-xs font-semibold">
                      View all {postData.comments.length} comments
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredConversations = conversations.filter((c) =>
    c.user.name.toLowerCase().includes(shareSearchQuery.toLowerCase()) ||
    c.user.username.toLowerCase().includes(shareSearchQuery.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      {/* Top Locality Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
        <View className="flex-row items-center">
          <View className="bg-[#2b4afc]/10 p-2 rounded-xl mr-3">
            <Feather name="map-pin" size={18} color="#2b4afc" />
          </View>
          <View>
            <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Neighborhood Feed
            </Text>
            <Text className="text-base font-bold text-gray-900 leading-5">
              {dbUser?.location || "Kharghar"}
            </Text>
          </View>
        </View>
      </View>

      {/* Feed List */}
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item._id}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        onEndReached={() => {
          if (hasMore && !isLoading && !isFetchingMore) {
            fetchFeed(false);
          }
        }}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          isFetchingMore ? (
            <View className="py-4 items-center justify-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : null
        }
        ListHeaderComponent={
          /* Post Composer Header */
          <View className="p-4 border-b border-gray-100 flex-row bg-white">
            <Image
              source={{ uri: dbUser?.profilePicture || defaultAvatar }}
              className="w-11 h-11 rounded-full mr-3 bg-gray-100"
            />
            <View className="flex-1">
              <TextInput
                placeholder="What's happening?"
                placeholderTextColor="#657786"
                className="text-lg text-gray-900 min-h-12 py-1"
                multiline
                value={composerText}
                onChangeText={setComposerText}
              />

              {/* Compose Image Preview */}
              {selectedImageUris.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mt-2">
                  {selectedImageUris.map((uri, index) => (
                    <View key={index} className="relative rounded-xl overflow-hidden bg-gray-100 size-20">
                      <Image
                        source={{ uri }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => setSelectedImageUris(prev => prev.filter((_, i) => i !== index))}
                        className="absolute top-1 right-1 bg-black/60 size-5 rounded-full items-center justify-center"
                      >
                        <Feather name="x" size={12} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Action Toolbar */}
              <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-gray-50">
                <TouchableOpacity onPress={pickImage} className="p-2 -ml-2">
                  <Feather name="image" size={20} color="#2b4afc" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreatePost}
                  disabled={isPosting || (!composerText.trim() && selectedImageUris.length === 0)}
                  className={`px-5 py-2 rounded-full flex-row items-center ${
                    composerText.trim() || selectedImageUris.length > 0 ? "bg-[#2b4afc]" : "bg-gray-200"
                  }`}
                >
                  {isPosting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className={`font-bold text-[14px] ${
                      composerText.trim() || selectedImageUris.length > 0 ? "text-white" : "text-gray-400"
                    }`}>
                      Post
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : (
            <View className="py-20 items-center justify-center px-4">
              <Text className="text-gray-500 text-center text-base">
                No posts yet. Start the conversation!
              </Text>
            </View>
          )
        }
      />

      {/* COMMENT MODAL */}
      <Modal visible={commentModalVisible} animationType="slide" presentationStyle="pageSheet">
        {commentingOnPost && (
          <SafeAreaView className="flex-1 bg-white">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                <Text className="text-gray-600 text-base font-semibold">Cancel</Text>
              </TouchableOpacity>
              <Text className="font-bold text-gray-900 text-base">Reply</Text>
              <TouchableOpacity
                onPress={handleCreateComment}
                disabled={isCommenting || !commentText.trim()}
                className={`px-4 py-1.5 rounded-full ${
                  commentText.trim() ? "bg-[#2b4afc]" : "bg-gray-100"
                }`}
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

            {/* Target Post Context */}
            <View className="p-4 flex-row border-b border-gray-50 bg-gray-50/50">
              <Image
                source={{ uri: commentingOnPost.user?.profilePicture || defaultAvatar }}
                className="w-10 h-10 rounded-full mr-3 bg-gray-100"
              />
              <View className="flex-1">
                <Text className="font-bold text-gray-900 text-sm">
                  {`${commentingOnPost.user?.firstName || ""} ${commentingOnPost.user?.lastName || ""}`.trim() ||
                    commentingOnPost.user?.username}
                </Text>
                <Text className="text-gray-500 text-xs mt-0.5">
                  Replying to @{commentingOnPost.user?.username}
                </Text>
                <Text className="text-gray-700 text-[14px] mt-2" numberOfLines={3}>
                  {commentingOnPost.content}
                </Text>
              </View>
            </View>

            {/* Comment Composer Input */}
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
      <Modal visible={shareModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShareModalVisible(false)}>
        <SafeAreaView className="flex-1 bg-white">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <TouchableOpacity onPress={() => setShareModalVisible(false)}>
              <Text className="text-gray-600 text-base font-semibold">Cancel</Text>
            </TouchableOpacity>
            <Text className="font-bold text-gray-900 text-base">Send to Neighbors</Text>
            <View className="w-10" />
          </View>

          {/* Search bar inside Modal */}
          <View className="px-4 py-2.5 border-b border-gray-100">
            <View className="flex-row items-center bg-gray-100 rounded-full px-3.5 py-2">
              <Feather name="search" size={16} color="#657786" />
              <TextInput
                placeholder="Search neighbors..."
                placeholderTextColor="#657786"
                className="flex-1 ml-2 text-sm text-gray-900"
                value={shareSearchQuery}
                onChangeText={setShareSearchQuery}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Conversation List */}
          {isShareLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#2b4afc" />
            </View>
          ) : (
            <View className="flex-1">
              <FlatList
                data={filteredConversations.slice(0, 5)} // Limit to top 5 recent contacts as requested
                keyExtractor={(item) => item.id}
                className="flex-1"
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => {
                  const isSelected = selectedShareUserIds.has(item.user._id);
                  return (
                    <TouchableOpacity
                      onPress={() => toggleShareUserSelection(item.user._id)}
                      className="flex-row items-center justify-between py-3 border-b border-gray-100 active:bg-gray-50/50"
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <Image
                          source={{ uri: item.user.avatar || defaultAvatar }}
                          className="w-11 h-11 rounded-full mr-3 bg-gray-100"
                        />
                        <View className="flex-1">
                          <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>
                            {item.user.name}
                          </Text>
                          <Text className="text-gray-500 text-sm" numberOfLines={1}>
                            @{item.user.username}
                          </Text>
                        </View>
                      </View>

                      {/* Checkbox */}
                      <View className="mr-2">
                        {isSelected ? (
                          <Feather name="check-circle" size={22} color="#2b4afc" />
                        ) : (
                          <Feather name="circle" size={22} color="#becbd6" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View className="py-20 items-center justify-center">
                    <Text className="text-gray-500">No conversations found</Text>
                  </View>
                }
              />

              {/* Send Separately button footer */}
              {selectedShareUserIds.size > 0 && (
                <View className="p-4 border-t border-gray-100 bg-white">
                  <TouchableOpacity
                    onPress={handleSendSeparately}
                    disabled={isSendingShare}
                    className="w-full bg-[#2b4afc] py-4 rounded-full flex-row items-center justify-center shadow-lg shadow-[#2b4afc]/25"
                  >
                    {isSendingShare ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-bold text-base">
                        Send Separately ({selectedShareUserIds.size})
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
