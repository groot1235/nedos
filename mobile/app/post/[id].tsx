import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";
import { StatusBar } from "expo-status-bar";

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
  parentComment?: string | null;
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
    homeLocality?: string;
  };
  content: string;
  image?: string;
  images?: string[];
  video?: string;
  likes: string[];
  comments: string[] | CommentType[];
  repostOf?: PostType | null;
  reposts: string[];
  savedBy?: string[];
  createdAt: string;
  type?: "discussion" | "alert" | "marketplace" | "event" | "poll";
  locality: string;
  poll?: {
    question: string;
    options: PollOption[];
    expiresAt: string;
  } | null;
};

const defaultAvatar =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face";

export default function PostDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { getToken } = useAuth();
  const { dbUser } = useUserContext();
  const router = useRouter();

  const [post, setPost] = useState<PostType | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommentType | null>(null);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (id) {
      fetchPostAndComments();
    }
  }, [id]);

  const fetchPostAndComments = async () => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch Post Details
      const postRes = await fetch(`${API_URL}/api/posts/${id}`, { headers });
      if (!postRes.ok) throw new Error("Failed to fetch post");
      const postData = await postRes.json();
      setPost(postData.post);

      // Fetch Comments
      const commentsRes = await fetch(`${API_URL}/api/comments/post/${id}`, { headers });
      if (!commentsRes.ok) throw new Error("Failed to fetch comments");
      const commentsData = await commentsRes.json();
      setComments(commentsData.comments || []);
    } catch (error) {
      console.error("Error loading thread details:", error);
      Alert.alert("Error", "Failed to load post details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLikePost = async () => {
    if (!post || !dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${post._id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to like post");

      const hasLiked = post.likes.includes(dbUser._id);
      const updatedLikes = hasLiked
        ? post.likes.filter((uid) => uid !== dbUser._id)
        : [...post.likes, dbUser._id];

      setPost({ ...post, likes: updatedLikes });
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  const handleRepostPost = async () => {
    if (!post || !dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${post._id}/repost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to repost");
      const data = await response.json();

      const hasReposted = post.reposts.includes(dbUser._id);
      const updatedReposts = hasReposted
        ? post.reposts.filter((uid) => uid !== dbUser._id)
        : [...post.reposts, dbUser._id];

      setPost({ ...post, reposts: updatedReposts });
      Alert.alert("Success", data.message);
    } catch (err) {
      console.error("Error reposting:", err);
    }
  };

  const handleToggleSave = async () => {
    if (!post || !dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${post._id}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to save post");
      const data = await response.json();

      const savedBy = post.savedBy || [];
      const updatedSavedBy = savedBy.includes(dbUser._id)
        ? savedBy.filter((uid) => uid !== dbUser._id)
        : [...savedBy, dbUser._id];

      setPost({ ...post, savedBy: updatedSavedBy });
      Alert.alert("Saved", data.message);
    } catch (err) {
      console.error("Error saving post:", err);
    }
  };

  const handleVote = async (optionText: string) => {
    if (!post || !dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/posts/${post._id}/poll/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ optionText }),
      });

      if (!response.ok) throw new Error("Failed to cast vote");
      const data = await response.json();
      setPost(data.post);
    } catch (err) {
      console.error("Error voting:", err);
      Alert.alert("Vote Failed", "Failed to register your vote. Try again.");
    }
  };

  const handleAddComment = async () => {
    if (!post || !commentText.trim()) return;
    try {
      setIsSubmittingComment(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/comments/post/${post._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: commentText.trim(),
          parentComment: replyingTo?._id || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to publish comment");
      const data = await response.json();

      setComments((prev) => [...prev, data.comment]);
      setCommentText("");
      setReplyingTo(null);

      // Increment comment count locally
      const currentCommentsList = Array.isArray(post.comments) ? post.comments : [];
      setPost({
        ...post,
        comments: [...currentCommentsList, data.comment._id],
      });
    } catch (error) {
      console.error("Error posting comment:", error);
      Alert.alert("Comment Failed", "Could not publish comment. Try again.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleShare = async () => {
    if (!post) return;
    try {
      await Share.share({
        message: `${post.user.firstName} posted in ${post.locality}: "${post.content}"`,
      });
    } catch (error) {
      console.error("Error sharing post:", error);
    }
  };

  const startReply = (comment: CommentType) => {
    setReplyingTo(comment);
    inputRef.current?.focus();
  };

  const renderFormattedContent = (content: string) => {
    if (!content) return null;
    const parts = content.split(/(https?:\/\/\S+|www\.\S+|#\w+|@\w+)/g);
    return (
      <Text className="text-gray-800 text-[16px] leading-6 mt-2">
        {parts.map((part, index) => {
          if (part.startsWith("#")) {
            return (
              <Text
                key={index}
                className="text-[#2b4afc] font-semibold"
                onPress={() => router.push({ pathname: "/search", params: { q: part } })}
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
                onPress={() => router.push(`/user/${username}` as any)}
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

  // Build threaded comments tree into a single flat list for visual mapping
  const getThreadedComments = () => {
    const rootComments = comments.filter((c) => !c.parentComment);
    const sortedFlattened: (CommentType & { isReply?: boolean })[] = [];

    rootComments.forEach((root) => {
      sortedFlattened.push(root);
      const replies = comments.filter((c) => c.parentComment === root._id);
      replies.forEach((reply) => {
        sortedFlattened.push({ ...reply, isReply: true });
      });
    });

    return sortedFlattened;
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#2b4afc" />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center px-6">
        <Feather name="alert-triangle" size={48} color="#becbd6" />
        <Text className="text-gray-500 mt-4 text-base text-center">Post not found or has been deleted.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 bg-[#2b4afc] px-6 py-2.5 rounded-full"
        >
          <Text className="text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isLiked = dbUser ? post.likes.includes(dbUser._id) : false;
  const isReposted = dbUser ? post.reposts.includes(dbUser._id) : false;
  const isSaved = dbUser ? (post.savedBy || []).includes(dbUser._id) : false;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ title: "Post Thread", headerShown: true }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-1"
      >
        <FlatList
          data={getThreadedComments()}
          keyExtractor={(item) => item._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            <View className="p-4 border-b border-gray-100">
              {/* Header profile row */}
              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={() => router.push(`/user/${post.user.username}` as any)}
                  className="flex-row items-center"
                >
                  <Image
                    source={{ uri: post.user.profilePicture || defaultAvatar }}
                    className="w-12 h-12 rounded-full bg-gray-100"
                  />
                  <View className="ml-3">
                    <Text className="text-gray-900 font-extrabold text-base">
                      {`${post.user.firstName || ""} ${post.user.lastName || ""}`.trim() ||
                        post.user.username}
                    </Text>
                    <Text className="text-gray-500 text-xs mt-0.5">@{post.user.username}</Text>
                  </View>
                </TouchableOpacity>

                {/* Badges */}
                <View className="flex-row items-center">
                  <View className="bg-gray-100 rounded-full px-2.5 py-1 mr-1.5 flex-row items-center">
                    <Feather name="map-pin" size={10} color="#657786" />
                    <Text className="text-gray-600 text-[10px] ml-1 font-semibold">
                      {post.locality}
                    </Text>
                  </View>
                  {post.type && post.type !== "discussion" && (
                    <View
                      className={`rounded-full px-2.5 py-1 ${
                        post.type === "alert"
                          ? "bg-red-50"
                          : post.type === "marketplace"
                          ? "bg-emerald-50"
                          : post.type === "event"
                          ? "bg-purple-50"
                          : "bg-blue-50"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-extrabold capitalize ${
                          post.type === "alert"
                            ? "text-red-500"
                            : post.type === "marketplace"
                            ? "text-emerald-600"
                            : post.type === "event"
                            ? "text-purple-600"
                            : "text-[#2b4afc]"
                        }`}
                      >
                        {post.type}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Repost Indicator */}
              {post.repostOf && (
                <View className="flex-row items-center bg-gray-50 rounded-2xl p-3 border border-gray-100 mt-3 mb-2">
                  <Feather name="repeat" size={12} color="#657786" />
                  <Text className="text-gray-500 text-xs ml-2 font-medium">
                    Repost of @{post.repostOf.user?.username || "user"}
                  </Text>
                </View>
              )}

              {/* Main Content */}
              {renderFormattedContent(post.content)}

              {/* Video Player */}
              {post.video ? (
                <View className="mt-3 rounded-2xl overflow-hidden bg-black shadow-sm">
                  <Video
                    source={{ uri: post.video }}
                    rate={1.0}
                    volume={1.0}
                    isMuted={false}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping
                    useNativeControls
                    style={{ width: "100%", height: Dimensions.get("window").width * 0.56 }}
                  />
                </View>
              ) : null}

              {/* Multi-Images Collage */}
              {post.images && post.images.length > 0 ? (
                <View className="mt-3">
                  {post.images.length === 1 ? (
                    <Image
                      source={{ uri: post.images[0] }}
                      className="w-full h-64 rounded-2xl bg-gray-100"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="flex-row flex-wrap justify-between">
                      {post.images.slice(0, 4).map((img, idx) => (
                        <Image
                          key={idx}
                          source={{ uri: img }}
                          className="rounded-xl bg-gray-100 mb-2"
                          style={{
                            width: post.images!.length === 2 ? "49%" : "48%",
                            height: post.images!.length === 2 ? 180 : 120,
                          }}
                          resizeMode="cover"
                        />
                      ))}
                    </View>
                  )}
                </View>
              ) : post.image ? (
                <Image
                  source={{ uri: post.image }}
                  className="w-full h-64 rounded-2xl mt-3 bg-gray-100"
                  resizeMode="cover"
                />
              ) : null}

              {/* Poll Details Component */}
              {post.type === "poll" && post.poll ? (
                <View className="mt-4 bg-gray-50 border border-gray-100 rounded-3xl p-5">
                  <Text className="text-gray-900 font-extrabold text-[16px] mb-3 leading-5">
                    {post.poll.question}
                  </Text>

                  {/* Poll Options */}
                  {(() => {
                    const totalVotes = post.poll.options.reduce(
                      (acc, opt) => acc + opt.votes.length,
                      0
                    );
                    const isExpired = new Date(post.poll.expiresAt).getTime() < Date.now();
                    const hasVoted = post.poll.options.some((opt) =>
                      dbUser ? opt.votes.includes(dbUser._id) : false
                    );
                    const showResults = hasVoted || isExpired;

                    return (
                      <View className="space-y-2.5">
                        {post.poll.options.map((option, index) => {
                          const optionVoteCount = option.votes.length;
                          const percentage =
                            totalVotes > 0 ? Math.round((optionVoteCount / totalVotes) * 100) : 0;
                          const userVotedForThis = dbUser
                            ? option.votes.includes(dbUser._id)
                            : false;

                          if (showResults) {
                            return (
                              <View
                                key={index}
                                className={`relative flex-row items-center justify-between p-4 mb-2.5 rounded-2xl border ${
                                  userVotedForThis
                                    ? "border-[#2b4afc] bg-white"
                                    : "border-gray-200 bg-white"
                                } overflow-hidden`}
                              >
                                {/* Fill background bar */}
                                <View
                                  className="absolute left-0 top-0 bottom-0 bg-[#2b4afc]/10"
                                  style={{ width: `${percentage}%` }}
                                />

                                <View className="flex-row items-center flex-1 pr-4 z-10">
                                  {userVotedForThis && (
                                    <Feather
                                      name="check-circle"
                                      size={14}
                                      color="#2b4afc"
                                      className="mr-2"
                                    />
                                  )}
                                  <Text
                                    className={`text-[14px] ${
                                      userVotedForThis
                                        ? "text-[#2b4afc] font-bold"
                                        : "text-gray-800 font-medium"
                                    }`}
                                  >
                                    {option.optionText}
                                  </Text>
                                </View>

                                <Text className="text-gray-500 text-xs font-bold z-10">
                                  {optionVoteCount} {optionVoteCount === 1 ? "vote" : "votes"} (
                                  {percentage}%)
                                </Text>
                              </View>
                            );
                          } else {
                            return (
                              <TouchableOpacity
                                key={index}
                                onPress={() => handleVote(option.optionText)}
                                className="w-full bg-white border border-gray-200 p-4 rounded-2xl flex-row items-center justify-center mb-2.5 shadow-sm"
                              >
                                <Text className="text-gray-800 font-semibold text-[14px]">
                                  {option.optionText}
                                </Text>
                              </TouchableOpacity>
                            );
                          }
                        })}

                        <View className="flex-row items-center justify-between mt-2.5">
                          <Text className="text-gray-400 text-xs">
                            {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
                          </Text>
                          <Text className="text-gray-400 text-xs">
                            {isExpired ? "Poll closed" : "Poll active"}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              {/* Timestamp */}
              <Text className="text-gray-400 text-xs mt-4">
                {new Date(post.createdAt).toLocaleDateString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>

              {/* Interactive buttons bar */}
              <View className="flex-row items-center justify-between border-t border-b border-gray-100 py-3.5 mt-4">
                <TouchableOpacity onPress={handleLikePost} className="flex-row items-center px-4">
                  <Feather
                    name="heart"
                    size={20}
                    color={isLiked ? "#e0245e" : "#657786"}
                    className={isLiked ? "fill-[#e0245e]" : ""}
                  />
                  <Text
                    className={`text-xs ml-1.5 font-bold ${
                      isLiked ? "text-[#e0245e]" : "text-gray-500"
                    }`}
                  >
                    {post.likes.length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-center px-4">
                  <Feather name="message-circle" size={20} color="#657786" />
                  <Text className="text-gray-500 text-xs ml-1.5 font-bold">
                    {comments.length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleRepostPost} className="flex-row items-center px-4">
                  <Feather name="repeat" size={20} color={isReposted ? "#17bf63" : "#657786"} />
                  <Text
                    className={`text-xs ml-1.5 font-bold ${
                      isReposted ? "text-[#17bf63]" : "text-gray-500"
                    }`}
                  >
                    {post.reposts.length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleToggleSave} className="flex-row items-center px-4">
                  <Feather name="bookmark" size={20} color={isSaved ? "#2b4afc" : "#657786"} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleShare} className="flex-row items-center px-4">
                  <Feather name="share-2" size={20} color="#657786" />
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isReply = item.isReply;
            return (
              <View
                className={`p-4 border-b border-gray-50 flex-row ${
                  isReply ? "pl-14 bg-gray-50/20" : ""
                }`}
              >
                {/* Visual Thread Connecting Line */}
                {isReply && (
                  <View className="absolute left-[36px] top-0 bottom-0 w-[1.5px] bg-gray-200" />
                )}

                <Image
                  source={{ uri: item.user.profilePicture || defaultAvatar }}
                  className="w-10 h-10 rounded-full bg-gray-100"
                />

                <View className="ml-3 flex-1">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Text className="text-gray-900 font-extrabold text-[14px]">
                        {`${item.user.firstName || ""} ${item.user.lastName || ""}`.trim() ||
                          item.user.username}
                      </Text>
                      <Text className="text-gray-400 text-xs ml-1.5">@{item.user.username}</Text>
                    </View>
                    <Text className="text-gray-400 text-[10px]">
                      {new Date(item.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>

                  <Text className="text-gray-800 text-[14px] mt-1.5 leading-5 font-normal">
                    {item.content}
                  </Text>

                  {/* Actions (Reply trigger) */}
                  <TouchableOpacity
                    onPress={() => startReply(item)}
                    className="flex-row items-center mt-3 bg-gray-50 self-start px-3 py-1 rounded-full border border-gray-100"
                  >
                    <Feather name="corner-up-left" size={12} color="#657786" />
                    <Text className="text-gray-500 text-xs ml-1.5 font-bold">Reply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="py-12 items-center justify-center">
              <Feather name="message-square" size={36} color="#becbd6" />
              <Text className="text-gray-400 text-[14px] mt-2 font-medium">No comments yet.</Text>
              <Text className="text-gray-400 text-xs mt-1">Be the first to share your thoughts!</Text>
            </View>
          }
        />

        {/* Comment Composer */}
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 shadow-lg">
          {/* Replying banner */}
          {replyingTo && (
            <View className="flex-row items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 mb-2 border border-gray-100">
              <Text className="text-gray-500 text-xs">
                Replying to <Text className="font-bold text-[#2b4afc]">@{replyingTo.user.username}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Feather name="x" size={14} color="#657786" />
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row items-center bg-gray-50 rounded-2xl border border-gray-200/60 px-3.5 py-1.5">
            <TextInput
              ref={inputRef}
              placeholder={replyingTo ? "Write your reply..." : "Add your comment..."}
              placeholderTextColor="#657786"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
              className="flex-1 text-[15px] text-gray-900 py-1.5 pr-2.5 max-h-24"
            />
            <TouchableOpacity
              onPress={handleAddComment}
              disabled={!commentText.trim() || isSubmittingComment}
              className={`rounded-xl p-2.5 ${
                commentText.trim() && !isSubmittingComment ? "bg-[#2b4afc]" : "bg-gray-200"
              }`}
            >
              {isSubmittingComment ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Feather name="send" size={16} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
