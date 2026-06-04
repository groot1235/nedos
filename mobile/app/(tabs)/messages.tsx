import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { TapGestureHandler, State } from "react-native-gesture-handler";
import { Clipboard, Dimensions } from "react-native";
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useUserContext } from "@/context/UserContext";
import { useSocket } from "@/context/SocketContext";
import { API_URL } from "@/utils/api";

type DbMessage = {
  _id: string;
  sender: string;
  recipient: string;
  text?: string;
  image?: string;
  audio?: string;
  createdAt: string;
  read?: boolean;
  edited?: boolean;
  deleted?: boolean;
  reactions?: {
    userId: {
      _id: string;
      username: string;
      firstName?: string;
      lastName?: string;
    } | string;
    emoji: string;
  }[];
  replyTo?: {
    _id: string;
    sender: {
      _id: string;
      username: string;
      firstName?: string;
      lastName?: string;
      profilePicture?: string;
    } | string;
    text?: string;
    image?: string;
    audio?: string;
    deleted?: boolean;
  } | null;
  sharedPost?: {
    _id: string;
    user: {
      _id: string;
      username: string;
      firstName?: string;
      lastName?: string;
      profilePicture?: string;
    };
    content: string;
    image?: string;
    createdAt: string;
  } | null;
  sending?: boolean;
};

type ConversationUser = {
  _id: string;
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
};

type ConversationType = {
  id: string;
  user: ConversationUser;
  lastMessage: string;
  time: string;
  timestamp: string;
  unreadCount?: number;
  hasMessage?: boolean;
};

// Voice Player Component for playback of audio messages
const VoicePlayer = ({ audioUrl }: { audioUrl: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState({ position: 0, duration: 1 });

  const togglePlay = async () => {
    try {
      if (isPlaying && sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        if (sound) {
          await sound.replayAsync();
          setIsPlaying(true);
        } else {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
          });

          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioUrl },
            { shouldPlay: true },
            onPlaybackStatusUpdate
          );
          setSound(newSound);
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPlaybackStatus({
        position: status.positionMillis || 0,
        duration: status.durationMillis || 1,
      });

      if (status.didJustFinish) {
        setIsPlaying(false);
        if (sound) {
          sound.setPositionAsync(0);
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const progress = Math.min(1, Math.max(0, playbackStatus.position / playbackStatus.duration));

  return (
    <View className="flex-row items-center bg-blue-100 rounded-2xl p-3 gap-3 w-56 mt-1">
      <TouchableOpacity
        onPress={togglePlay}
        className="size-9 bg-blue-500 rounded-full items-center justify-center"
      >
        <Feather name={isPlaying ? "pause" : "play"} size={18} color="white" />
      </TouchableOpacity>
      <View className="flex-1">
        <View className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
          <View
            className="h-full bg-blue-600 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
        <Text className="text-[10px] text-blue-700 mt-1 font-medium">
          {isPlaying ? "Playing voice message" : "Voice Message"}
        </Text>
      </View>
    </View>
  );
};

const SwipeableRow = ({
  children,
  onDelete,
  onMute,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onMute: () => void;
}) => {
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={140}
      decelerationRate="fast"
      contentContainerStyle={{ width: Dimensions.get("window").width + 140 }}
      onScrollEndDrag={(e) => {
        const x = e.nativeEvent.contentOffset.x;
        if (x > 70) {
          scrollViewRef.current?.scrollTo({ x: 140, animated: true });
        } else {
          scrollViewRef.current?.scrollTo({ x: 0, animated: true });
        }
      }}
    >
      <View style={{ width: Dimensions.get("window").width }}>
        {children}
      </View>
      <View className="flex-row w-[140px] h-full">
        <TouchableOpacity
          onPress={() => {
            onMute();
            scrollViewRef.current?.scrollTo({ x: 0, animated: true });
          }}
          className="bg-slate-100 justify-center items-center h-full w-[70px]"
        >
          <Feather name="bell-off" size={18} color="#475569" />
          <Text className="text-slate-600 text-[10px] font-bold mt-1">Mute</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            onDelete();
            scrollViewRef.current?.scrollTo({ x: 0, animated: true });
          }}
          className="bg-red-500 justify-center items-center h-full w-[70px]"
        >
          <Feather name="trash-2" size={18} color="white" />
          <Text className="text-white text-[10px] font-bold mt-1">Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const MessagesScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { getToken } = useAuth();
  const { dbUser, syncDbUser } = useUserContext();
  const { socket, onlineUsers } = useSocket();

  const [searchText, setSearchText] = useState("");
  const [conversationsList, setConversationsList] = useState<ConversationType[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  
  const [selectedUser, setSelectedUser] = useState<ConversationUser | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeMessages, setActiveMessages] = useState<DbMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);

  // Global Search states
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Reaction, Reply & View states
  const [selectedMessageForReaction, setSelectedMessageForReaction] = useState<DbMessage | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<DbMessage | null>(null);
  const [fullScreenImageUri, setFullScreenImageUri] = useState<string | null>(null);

  // Inputs
  const [newMessage, setNewMessage] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);

  // Audio Recording states & refs for race conditions
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isPreparingRef = useRef(false);
  const shouldStopRef = useRef(false);

  // Chat premium states
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [editingMessage, setEditingMessage] = useState<DbMessage | null>(null);

  // Typing indicators refs
  const typingTimeoutRef = useRef<any>(null);
  const isCurrentlyTypingRef = useRef(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const [vanishModeEnabled, setVanishModeEnabled] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<DbMessage | null>(null);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert("Copied", "Message copied to clipboard!");
  };

  const handleDeleteConversation = (targetUserId: string, targetUsername: string) => {
    Alert.alert(
      "Delete Chat",
      `Are you sure you want to delete your conversation with @${targetUsername}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert("Success", "Conversation deleted successfully.");
            setConversationsList((prev) => prev.filter((c) => c.user._id !== targetUserId));
          },
        },
      ]
    );
  };

  const handleMuteConversation = (targetUsername: string) => {
    Alert.alert("Notifications Muted", `You will no longer receive alerts for messages from @${targetUsername}.`);
  };

  const handleForwardMessage = (recipientId: string) => {
    if (!forwardingMessage) return;
    Alert.alert(
      "Forward Message",
      "Forward this message to neighbor?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/api/messages/send/${recipientId}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  text: forwardingMessage.text || "",
                }),
              });
              if (!response.ok) throw new Error("Failed to forward message");
              Alert.alert("Success", "Message forwarded!");
              setForwardModalVisible(false);
              setForwardingMessage(null);
            } catch (err) {
              console.error("Error forwarding message:", err);
              Alert.alert("Error", "Could not forward message.");
            }
          },
        },
      ]
    );
  };

  const takeQuickSnap = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Permission to access camera is required!");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      handleSendMediaDirect(result.assets[0].uri, "image");
    }
  };

  const handleSendMediaDirect = async (uri: string, type: "image" | "audio") => {
    try {
      const token = await getToken();
      const formData = new FormData();
      const filename = uri.split("/").pop();
      const match = /\.(\w+)$/.exec(filename || "");
      const mimeType = match ? `image/${match[1]}` : "image/jpeg";

      formData.append("file", {
        uri,
        name: filename || "photo.jpg",
        type: mimeType,
      } as any);

      if (vanishModeEnabled) {
        formData.append("vanishMode", "true");
      }

      const tempId = `temp-${Date.now()}`;
      const tempMessage: DbMessage = {
        _id: tempId,
        sender: dbUser?._id || "",
        recipient: selectedUser?._id || "",
        image: uri,
        createdAt: new Date().toISOString(),
        read: false,
        sending: true,
      };

      setActiveMessages((prev) => [...prev, tempMessage]);
      scrollViewRef.current?.scrollToEnd({ animated: true });

      const response = await fetch(`${API_URL}/api/messages/send/${selectedUser?._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to send media");
      const data = await response.json();

      setActiveMessages((prev) =>
        prev.map((msg) => (msg._id === tempId ? data.message : msg))
      );
      fetchConversations();
    } catch (err) {
      console.error("Error sending camera snap:", err);
      Alert.alert("Error", "Failed to send photo.");
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [dbUser?._id]);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.warn("Failed to get push token for push notifications!");
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId,
      });
      const token = tokenData.data;

      const authToken = await getToken();
      await fetch(`${API_URL}/api/users/push-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
    } catch (error) {
      console.error("Error setting up push notifications token:", error);
    }
  };

  // Handle URL Params navigation from Search Screen
  useEffect(() => {
    if (params?.openUserId) {
      const targetUser = {
        _id: params.openUserId as string,
        name: params.openUserName as string,
        username: params.openUserUsername as string,
        avatar: params.openUserAvatar as string || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
        verified: false,
      };

      openConversation(targetUser);

      // Clear params from route so it doesn't reopen
      router.setParams({
        openUserId: "",
        openUserName: "",
        openUserUsername: "",
        openUserAvatar: "",
      });
    }
  }, [params?.openUserId]);

  // Real-time socket message, reaction, typing, read, edit & delete handlers
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (message: DbMessage) => {
      // If we are currently chatting with the sender (or the recipient is the other user of active chat)
      if (
        isChatOpen &&
        selectedUser &&
        (message.sender === selectedUser._id || message.recipient === selectedUser._id)
      ) {
        setActiveMessages((prev) => [...prev, message]);

        // Mark as read on the backend if message is incoming from selectedUser
        if (message.sender === selectedUser._id) {
          try {
            const token = await getToken();
            await fetch(`${API_URL}/api/messages/read/${selectedUser._id}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
          } catch (err) {
            console.error("Error marking message as read on socket receive:", err);
          }
        }
      }
      // Re-fetch conversations to update the latest messages
      fetchConversations();
    };

    const handleMessageReaction = ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
      setActiveMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, reactions } : msg
        )
      );
    };

    const handleTyping = ({ senderId }: { senderId: string }) => {
      if (selectedUser && senderId === selectedUser._id) {
        setIsRecipientTyping(true);
      }
    };

    const handleStopTyping = ({ senderId }: { senderId: string }) => {
      if (selectedUser && senderId === selectedUser._id) {
        setIsRecipientTyping(false);
      }
    };

    const handleMessagesRead = ({ senderId, recipientId }: { senderId: string; recipientId: string }) => {
      // senderId is the one who sent (current user), recipientId is the one who read (selectedUser)
      if (isChatOpen && selectedUser && recipientId === selectedUser._id) {
        setActiveMessages((prev) =>
          prev.map((msg) =>
            msg.sender === dbUser?._id ? { ...msg, read: true } : msg
          )
        );
      }
      fetchConversations();
    };

    const handleMessageEdited = (editedMessage: DbMessage) => {
      if (
        isChatOpen &&
        selectedUser &&
        (editedMessage.sender === selectedUser._id || editedMessage.recipient === selectedUser._id)
      ) {
        setActiveMessages((prev) =>
          prev.map((msg) => (msg._id === editedMessage._id ? editedMessage : msg))
        );
      }
      fetchConversations();
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      if (isChatOpen) {
        setActiveMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId
              ? {
                  ...msg,
                  deleted: true,
                  text: "This message was deleted",
                  image: "",
                  audio: "",
                  replyTo: null,
                  sharedPost: null,
                  reactions: [],
                }
              : msg
          )
        );
      }
      fetchConversations();
    };

    socket.on("newMessage", handleNewMessage);
    socket.on("messageReaction", handleMessageReaction);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messagesRead", handleMessagesRead);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);

    const handleMessagesVanished = () => {
      if (isChatOpen && selectedUser) {
        fetchActiveMessages(selectedUser._id);
      }
      fetchConversations();
    };
    socket.on("messagesVanished", handleMessagesVanished);

    return () => {
      socket.off("newMessage", handleNewMessage);
      socket.off("messageReaction", handleMessageReaction);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messagesRead", handleMessagesRead);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("messagesVanished", handleMessagesVanished);
    };
  }, [socket, isChatOpen, selectedUser?._id, dbUser?._id]);

  // Debounced search for global users
  useEffect(() => {
    if (!searchText.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const token = await getToken();
        const response = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(searchText)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.users || []);
        }
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText]);

  useEffect(() => {
    // Scroll ScrollView to end whenever active messages change
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [activeMessages]);

  const fetchConversations = async () => {
    if (!dbUser?._id) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConversationsList(data.conversations || []);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setIsConversationsLoading(false);
    }
  };

  const fetchActiveMessages = async (userId: string) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setActiveMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error fetching active messages:", error);
    }
  };

  const openConversation = async (user: ConversationUser) => {
    setSelectedUser(user);
    setIsChatOpen(true);
    setIsMessagesLoading(true);
    setIsRecipientTyping(false);
    setEditingMessage(null);
    setNewMessage("");

    try {
      await fetchActiveMessages(user._id);

      const token = await getToken();
      // Mark messages as read immediately
      await fetch(`${API_URL}/api/messages/read/${user._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      fetchConversations();
    } catch (error) {
      console.error("Error opening conversation:", error);
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const closeChatModal = async () => {
    if (selectedUser) {
      try {
        const token = await getToken();
        await fetch(`${API_URL}/api/messages/vanish/cleanup/${selectedUser._id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("Error during vanish cleanup:", error);
      }
    }

    setVanishModeEnabled(false);
    isCurrentlyTypingRef.current = false;
    setIsRecipientTyping(false);
    setIsChatOpen(false);
    setSelectedUser(null);
    setActiveMessages([]);
    setNewMessage("");
    setSelectedImageUri(null);
    setRecordedAudioUri(null);
    setReplyToMessage(null);
    setEditingMessage(null);
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
              closeChatModal();
              fetchConversations();
            } catch (error) {
              console.error("Error blocking user:", error);
              Alert.alert("Error", "Failed to block user. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleReportUser = (reportedUserId: string) => {
    Alert.alert(
      "Report User",
      "Why are you reporting this user?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Spam", onPress: () => submitUserReport(reportedUserId, "spam") },
        { text: "Harassment", onPress: () => submitUserReport(reportedUserId, "harassment") },
        { text: "Inappropriate Behavior", onPress: () => submitUserReport(reportedUserId, "inappropriate") },
        { text: "Other", onPress: () => submitUserReport(reportedUserId, "other") },
      ]
    );
  };

  const submitUserReport = async (reportedUserId: string, reason: string) => {
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
          reason,
          description: `User reported this chat recipient for ${reason} via message thread interface.`,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit user report");
      Alert.alert("Report Submitted", "Thank you. Our moderation team will review this user.");
    } catch (error) {
      console.error("Error submitting user report:", error);
      Alert.alert("Error", "Could not submit report. Check your connection.");
    }
  };

  // Image Picking
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Permission to access photos is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImageUri(result.assets[0].uri);
      setRecordedAudioUri(null); // exclusive media inputs
    }
  };

  // Audio Recording
  const startRecording = async () => {
    if (isPreparingRef.current || recordingRef.current) return;
    isPreparingRef.current = true;
    shouldStopRef.current = false;
    setIsRecording(true);

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission Required", "Permission to access microphone is required!");
        setIsRecording(false);
        isPreparingRef.current = false;
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = newRecording;

      if (shouldStopRef.current) {
        await stopRecordingInternal();
      }
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Error", "Could not start audio recording");
      setIsRecording(false);
    } finally {
      isPreparingRef.current = false;
    }
  };

  const stopRecordingInternal = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecordedAudioUri(uri);
      setSelectedImageUri(null); // exclusive media inputs
    } catch (err) {
      console.error("Failed to stop recording", err);
    } finally {
      recordingRef.current = null;
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    shouldStopRef.current = true;
    if (isPreparingRef.current) {
      return;
    }
    await stopRecordingInternal();
  };

  const handleTextChange = (text: string) => {
    setNewMessage(text);
    if (!socket || !selectedUser) return;

    if (!isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      socket.emit("typing", { recipientId: selectedUser._id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (socket && selectedUser) {
        socket.emit("stopTyping", { recipientId: selectedUser._id });
      }
      isCurrentlyTypingRef.current = false;
    }, 1500);
  };

  // Message Sending
  const sendMessage = async () => {
    if (!selectedUser) return;

    const textToSend = newMessage.trim();
    const imageUri = selectedImageUri;
    const audioUri = recordedAudioUri;
    const parentReplyMessage = replyToMessage;

    if (!textToSend && !imageUri && !audioUri) return;

    // Clear typing indicators
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (socket && isCurrentlyTypingRef.current) {
      socket.emit("stopTyping", { recipientId: selectedUser._id });
    }
    isCurrentlyTypingRef.current = false;

    // Reset inputs immediately for fast feedback
    setNewMessage("");
    setSelectedImageUri(null);
    setRecordedAudioUri(null);
    setReplyToMessage(null);

    try {
      const token = await getToken();
      const formData = new FormData();

      if (textToSend) {
        formData.append("text", textToSend);
      }

      if (parentReplyMessage) {
        formData.append("replyTo", parentReplyMessage._id);
      }

      if (imageUri) {
        const filename = imageUri.split("/").pop() || "image.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        formData.append("file", {
          uri: imageUri,
          name: filename,
          type,
        } as any);
      } else if (audioUri) {
        const filename = audioUri.split("/").pop() || "audio.m4a";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `audio/${match[1]}` : `audio/m4a`;
        formData.append("file", {
          uri: audioUri,
          name: filename,
          type,
        } as any);
      }

      if (vanishModeEnabled) {
        formData.append("vanishMode", "true");
      }

      const response = await fetch(`${API_URL}/api/messages/send/${selectedUser._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      setActiveMessages((prev) => [...prev, data.message]);
      fetchConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message");
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedUser || !editingMessage || !newMessage.trim()) return;

    const textToSend = newMessage.trim();
    const msgId = editingMessage._id;

    // Clear typing indicators
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (socket && isCurrentlyTypingRef.current) {
      socket.emit("stopTyping", { recipientId: selectedUser._id });
    }
    isCurrentlyTypingRef.current = false;

    // Reset editing state immediately
    setEditingMessage(null);
    setNewMessage("");

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/${msgId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: textToSend }),
      });

      if (!response.ok) {
        throw new Error("Failed to edit message");
      }

      const data = await response.json();
      setActiveMessages((prev) =>
        prev.map((msg) => (msg._id === msgId ? data.message : msg))
      );
      fetchConversations();
    } catch (error) {
      console.error("Error editing message:", error);
      Alert.alert("Error", "Failed to edit message");
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    Alert.alert(
      "Delete Message",
      "Are you sure you want to delete this message? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Optimistically update locally
            setActiveMessages((prev) =>
              prev.map((msg) =>
                msg._id === messageId
                  ? {
                      ...msg,
                      deleted: true,
                      text: "This message was deleted",
                      image: "",
                      audio: "",
                      replyTo: null,
                      sharedPost: null,
                      reactions: [],
                    }
                  : msg
              )
            );
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/api/messages/${messageId}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!response.ok) {
                throw new Error("Failed to delete message");
              }
              fetchConversations();
            } catch (error) {
              console.error("Error deleting message:", error);
              Alert.alert("Error", "Failed to delete message");
            }
          },
        },
      ]
    );
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/${messageId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        const data = await response.json();
        setActiveMessages((prev) =>
          prev.map((msg) => (msg._id === messageId ? data.message : msg))
        );
      }
    } catch (error) {
      console.error("Error reacting to message:", error);
    }
  };

  // Format time display
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return timeStr;
    }
  };

  const getRelativeTime = (dateString: string) => {
    if (!dateString) return "";
    try {
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
    } catch {
      return "";
    }
  };

  const filteredConversations = conversationsList.filter(
    (conv) =>
      conv.user.name.toLowerCase().includes(searchText.toLowerCase()) ||
      conv.user.username.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Messages</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/search")}>
          <Feather name="edit" size={24} color="#2b4afc" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View className="px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-full px-4 py-3">
          <Feather name="search" size={20} color="#657786" />
          <TextInput
            placeholder="Search for people"
            className="flex-1 ml-3 text-base text-gray-900"
            placeholderTextColor="#657786"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* CONVERSATIONS LIST */}
      {isConversationsLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2b4afc" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        >
          {searchText.trim().length > 0 ? (
            <>
              {/* Global Search Results Section */}
              <View className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Global Search Results
                </Text>
              </View>
              {isSearchingGlobal ? (
                <View className="py-6 items-center justify-center">
                  <ActivityIndicator size="small" color="#2b4afc" />
                </View>
              ) : searchResults.length === 0 ? (
                <View className="p-4 items-center">
                  <Text className="text-gray-400 text-sm italic">No users found globally for "{searchText}"</Text>
                </View>
              ) : (
                searchResults.map((user) => {
                  const isOnline = onlineUsers.includes(user._id);
                  const handleUserSelect = () => {
                    const formattedUser: ConversationUser = {
                      _id: user._id,
                      name: `${user.firstName} ${user.lastName}`.trim() || user.username,
                      username: user.username,
                      avatar: user.profilePicture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
                      verified: false,
                    };
                    openConversation(formattedUser);
                  };

                  return (
                    <TouchableOpacity
                      key={user._id}
                      className="flex-row items-center p-4 border-b border-gray-50 active:bg-gray-50"
                      onPress={handleUserSelect}
                    >
                      <View className="relative mr-3">
                        <Image
                          source={{ uri: user.profilePicture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face" }}
                          className="size-10 rounded-full"
                        />
                        {isOnline && (
                          <View className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-white" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900">
                          {`${user.firstName} ${user.lastName}`.trim() || user.username}
                        </Text>
                        <Text className="text-gray-500 text-sm">@{user.username}</Text>
                      </View>
                      <Feather name="message-square" size={18} color="#2b4afc" className="mr-2" />
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Matched Local Conversations */}
              {filteredConversations.length > 0 && (
                <>
                  <View className="px-4 py-2 bg-gray-50 border-y border-gray-100 mt-2">
                    <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Active Conversations
                    </Text>
                  </View>
                  {filteredConversations.map((conversation) => {
                    const isOnline = onlineUsers.includes(conversation.user._id);
                    return (
                      <SwipeableRow
                        key={conversation.id}
                        onDelete={() => handleDeleteConversation(conversation.user._id, conversation.user.username)}
                        onMute={() => handleMuteConversation(conversation.user.username)}
                      >
                        <TouchableOpacity
                          className="flex-row items-center p-4 border-b border-gray-50 active:bg-gray-50 h-20"
                          onPress={() => openConversation(conversation.user)}
                        >
                        <View className="relative mr-3">
                          <Image
                            source={{ uri: conversation.user.avatar }}
                            className="size-12 rounded-full"
                          />
                          {isOnline && (
                            <View className="absolute bottom-0 right-0 size-3.5 bg-green-500 rounded-full border-2 border-white" />
                          )}
                        </View>

                        <View className="flex-1">
                          <View className="flex-row items-center justify-between mb-1">
                            <View className="flex-row items-center gap-1 flex-shrink">
                              <Text className={`mr-1 ${conversation.unreadCount && conversation.unreadCount > 0 ? "font-bold text-gray-900" : "font-normal text-gray-700"}`} numberOfLines={1}>
                                {conversation.user.name}
                              </Text>
                              <Text className="text-gray-500 text-sm" numberOfLines={1}>
                                @{conversation.user.username}
                              </Text>
                            </View>
                            <Text className="text-gray-400 text-xs ml-2">
                              {formatTime(conversation.time)}
                            </Text>
                          </View>
                          <View className="flex-row items-center justify-between">
                            <Text className={`text-sm flex-1 mr-2 ${conversation.unreadCount && conversation.unreadCount > 0 ? "font-semibold text-gray-900" : "font-normal text-gray-500"}`} numberOfLines={1}>
                              {conversation.lastMessage}
                            </Text>
                            {conversation.unreadCount && conversation.unreadCount > 0 ? (
                              <View className="bg-blue-600 rounded-full min-w-[20px] h-[20px] px-1.5 items-center justify-center">
                                <Text className="text-white text-[11px] font-bold">
                                  {conversation.unreadCount}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </SwipeableRow>
                  );
                })}
                </>
              )}
            </>
          ) : (
            <>
              {/* Horizontal Active Status Row */}
              {(() => {
                const onlineContacts = conversationsList.filter(c => onlineUsers.includes(c.user._id));
                if (onlineContacts.length === 0) return null;
                return (
                  <View className="py-4 border-b border-slate-100 bg-white">
                    <Text className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Online Now
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16 }}
                    >
                      {onlineContacts.map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          onPress={() => openConversation(contact.user)}
                          className="items-center mr-5"
                        >
                          <View className="relative">
                            <Image
                              source={{ uri: contact.user.avatar }}
                              className="w-14 h-14 rounded-full border border-slate-100 bg-slate-50"
                            />
                            <View className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                          </View>
                          <Text className="text-xs text-slate-700 mt-1 font-medium max-w-[60px]" numberOfLines={1}>
                            {contact.user.name.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                );
              })()}

              {conversationsList.length === 0 ? (
                <View className="flex-1 items-center justify-center p-6 mt-12">
                  <Text className="text-gray-500 text-lg text-center font-medium">No conversations yet</Text>
                  <Text className="text-gray-400 text-sm text-center mt-2">
                    Search for people to start chatting!
                  </Text>
                </View>
              ) : (
                conversationsList.map((conversation) => {
                  const isOnline = onlineUsers.includes(conversation.user._id);
                  return (
                    <SwipeableRow
                      key={conversation.id}
                      onDelete={() => handleDeleteConversation(conversation.user._id, conversation.user.username)}
                      onMute={() => handleMuteConversation(conversation.user.username)}
                    >
                      <TouchableOpacity
                        key={conversation.id}
                        className="flex-row items-center p-4 border-b border-gray-50 active:bg-gray-50 h-20"
                        onPress={() => openConversation(conversation.user)}
                      >
                      <View className="relative mr-3">
                        <Image
                          source={{ uri: conversation.user.avatar }}
                          className="size-12 rounded-full"
                        />
                        {isOnline && (
                          <View className="absolute bottom-0 right-0 size-3.5 bg-green-500 rounded-full border-2 border-white" />
                        )}
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between mb-1">
                          <View className="flex-row items-center gap-1 flex-shrink">
                            <Text className={`mr-1 ${conversation.unreadCount && conversation.unreadCount > 0 ? "font-bold text-gray-900" : "font-normal text-gray-700"}`} numberOfLines={1}>
                              {conversation.user.name}
                            </Text>
                            <Text className="text-gray-500 text-sm" numberOfLines={1}>
                              @{conversation.user.username}
                            </Text>
                          </View>
                          <Text className="text-gray-400 text-xs ml-2">
                            {formatTime(conversation.time)}
                          </Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className={`text-sm flex-1 mr-2 ${conversation.unreadCount && conversation.unreadCount > 0 ? "font-semibold text-gray-900" : "font-normal text-gray-500"}`} numberOfLines={1}>
                            {conversation.lastMessage}
                          </Text>
                          {conversation.unreadCount && conversation.unreadCount > 0 ? (
                            <View className="bg-blue-600 rounded-full min-w-[20px] h-[20px] px-1.5 items-center justify-center">
                              <Text className="text-white text-[11px] font-bold">
                                {conversation.unreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </SwipeableRow>
                );
              })
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* CHAT MODAL */}
      <Modal visible={isChatOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeChatModal}>
        {selectedUser && (
          <SafeAreaView className={`flex-1 ${vanishModeEnabled ? "bg-slate-950" : "bg-white"}`}>
            {/* Chat Header */}
            <View className={`flex-row items-center px-4 py-3 border-b ${vanishModeEnabled ? "bg-slate-950 border-slate-900" : "bg-white border-gray-100"}`}>
              <TouchableOpacity onPress={closeChatModal} className="mr-3">
                <Feather name="arrow-left" size={24} color={vanishModeEnabled ? "#a78bfa" : "#2b4afc"} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const username = selectedUser.username;
                  closeChatModal();
                  router.push(`/user/${username}` as any);
                }}
                className="flex-1 flex-row items-center mr-2"
              >
                <View className="relative mr-3">
                  <Image
                    source={{ uri: selectedUser.avatar }}
                    className="size-10 rounded-full bg-gray-100"
                  />
                  {onlineUsers.includes(selectedUser._id) && (
                    <View className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className={`font-semibold mr-1 ${vanishModeEnabled ? "text-slate-100" : "text-gray-900"}`}>
                      {selectedUser.name}
                    </Text>
                    {selectedUser.verified && (
                      <Feather name="check-circle" size={14} color="#2b4afc" />
                    )}
                  </View>
                  {isRecipientTyping ? (
                    <Text className={`text-xs font-semibold animate-pulse ${vanishModeEnabled ? "text-purple-400" : "text-blue-500"}`}>typing...</Text>
                  ) : (
                    <Text className={`text-xs ${vanishModeEnabled ? "text-slate-400" : "text-gray-500"}`}>@{selectedUser.username}</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Vanish Mode Switch */}
              <TouchableOpacity
                onPress={() => setVanishModeEnabled(!vanishModeEnabled)}
                className="flex-row items-center mr-3 bg-slate-100 px-3 py-1.5 rounded-full active:scale-95 border border-slate-200"
                style={vanishModeEnabled ? { backgroundColor: "#7c3aed", borderColor: "#6d28d9" } : {}}
              >
                <Feather name="eye-off" size={14} color={vanishModeEnabled ? "white" : "#657786"} />
                <Text className={`text-xs font-bold ml-1.5 ${vanishModeEnabled ? "text-white" : "text-gray-500"}`}>
                  Vanish Mode
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    "Options",
                    `Choose an action for @${selectedUser.username}`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Block User",
                        style: "destructive",
                        onPress: () => handleBlockUser(selectedUser._id, selectedUser.username),
                      },
                      {
                        text: "Report User",
                        onPress: () => handleReportUser(selectedUser._id),
                      },
                    ]
                  );
                }}
                className="p-1"
              >
                <Feather name="more-horizontal" size={20} color="#657786" />
              </TouchableOpacity>
            </View>

            {/* Chat Messages Area */}
            {isMessagesLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="small" color="#2b4afc" />
              </View>
            ) : (
              <ScrollView className={`flex-1 px-4 py-4 ${vanishModeEnabled ? "bg-slate-950" : "bg-white"}`} ref={scrollViewRef}>
                <View className="mb-4">
                  <Text className={`text-center text-xs mb-6 ${vanishModeEnabled ? "text-slate-600" : "text-gray-400"}`}>
                    This is the beginning of your conversation with {selectedUser.name}
                  </Text>

              {/* Conversation Messages */}
              {activeMessages.map((message, index) => {
                const isFromMe = message.sender === dbUser?._id;
                const isDeleted = message.deleted === true;
                const isLastMessage = index === activeMessages.length - 1;

                return (
                  <View
                    key={message._id}
                    className={`flex-row mb-4 ${isFromMe ? "justify-end" : ""}`}
                  >
                    {!isFromMe && (
                      <Image
                        source={{ uri: selectedUser.avatar }}
                        className="size-8 rounded-full mr-2 self-end mb-4 bg-gray-100"
                      />
                    )}
                    <View className={`flex-col max-w-[75%] ${isFromMe ? "items-end" : "items-start"}`}>
                      {/* Reply Quote Preview inside message bubble */}
                      {!isDeleted && message.replyTo && (
                        <View className={`rounded-xl p-2.5 mb-1.5 border-l-4 border-blue-400 ${isFromMe ? "bg-black/10" : "bg-black/5"} max-w-[220px]`}>
                          <Text className={`text-[10px] font-bold ${isFromMe ? "text-blue-200" : "text-blue-600"}`} numberOfLines={1}>
                            {(typeof message.replyTo.sender === "object" ? message.replyTo.sender?._id : message.replyTo.sender) === dbUser?._id
                              ? "You"
                              : message.replyTo.sender && typeof message.replyTo.sender === "object"
                              ? `${message.replyTo.sender.firstName || ""} ${message.replyTo.sender.lastName || ""}`.trim() || message.replyTo.sender.username
                              : "user"}
                          </Text>
                          <Text className={`text-[11px] mt-0.5 ${isFromMe ? "text-gray-200" : "text-gray-600"}`} numberOfLines={1}>
                            {message.replyTo.deleted ? "🚫 This message was deleted" : (message.replyTo.text || (message.replyTo.image ? "📷 Photo" : "🎵 Voice message"))}
                          </Text>
                        </View>
                      )}

                      {/* Image Message */}
                      {!isDeleted && message.image && (
                        <TapGestureHandler
                          numberOfTaps={2}
                          onHandlerStateChange={(event) => {
                            if (event.nativeEvent.state === State.ACTIVE) {
                              handleReactToMessage(message._id, "❤️");
                            }
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => setFullScreenImageUri(message.image || null)}
                            onLongPress={() => setSelectedMessageForReaction(message)}
                            activeOpacity={0.9}
                            className={message.sending ? "opacity-60" : ""}
                          >
                            <Image
                              source={{ uri: message.image }}
                              className="w-56 h-40 rounded-2xl mb-1 resize-cover"
                              style={isFromMe ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 }}
                            />
                          </TouchableOpacity>
                        </TapGestureHandler>
                      )}

                      {/* Audio/Voice Message */}
                      {!isDeleted && message.audio && (
                        <TapGestureHandler
                          numberOfTaps={2}
                          onHandlerStateChange={(event) => {
                            if (event.nativeEvent.state === State.ACTIVE) {
                              handleReactToMessage(message._id, "❤️");
                            }
                          }}
                        >
                          <TouchableOpacity
                            onLongPress={() => setSelectedMessageForReaction(message)}
                            activeOpacity={0.9}
                            className={`p-1 bg-gray-100 rounded-2xl ${isFromMe ? "rounded-tr-none bg-blue-100" : "rounded-tl-none"} ${message.sending ? "opacity-60" : ""}`}
                          >
                            <VoicePlayer audioUrl={message.audio} />
                          </TouchableOpacity>
                        </TapGestureHandler>
                      )}

                      {/* Shared Post Card Preview */}
                      {!isDeleted && message.sharedPost && (
                        <TapGestureHandler
                          numberOfTaps={2}
                          onHandlerStateChange={(event) => {
                            if (event.nativeEvent.state === State.ACTIVE) {
                              handleReactToMessage(message._id, "❤️");
                            }
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              closeChatModal();
                              router.push(`/post/${message.sharedPost?._id}` as any);
                            }}
                            onLongPress={() => setSelectedMessageForReaction(message)}
                            activeOpacity={0.9}
                            className={`rounded-2xl p-3 mb-1 border w-64 ${
                              isFromMe 
                                ? vanishModeEnabled 
                                  ? "bg-purple-950 border-purple-800"
                                  : "bg-[#2b4afc] border-[#1a38cf]" 
                                : vanishModeEnabled 
                                ? "bg-slate-800 border-slate-700" 
                                : "bg-gray-100 border-gray-200"
                            } ${isFromMe ? "rounded-tr-none" : "rounded-tl-none"} ${message.sending ? "opacity-60" : ""}`}
                          >
                            {/* Header: Author Info */}
                            <View className="flex-row items-center mb-2">
                              <Image
                                source={{ uri: message.sharedPost.user.profilePicture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face" }}
                                className="size-6 rounded-full bg-gray-200 mr-2"
                              />
                              <View className="flex-1 flex-row items-center flex-wrap gap-x-1">
                                <Text className={`font-bold text-[12px] ${isFromMe ? "text-white" : "text-gray-900"}`} numberOfLines={1}>
                                  {`${message.sharedPost.user.firstName || ""} ${message.sharedPost.user.lastName || ""}`.trim() || message.sharedPost.user.username}
                                </Text>
                                <Text className={`text-[10px] ${isFromMe ? "text-blue-200" : "text-gray-500"}`} numberOfLines={1}>
                                  @{message.sharedPost.user.username}
                                </Text>
                                <Text className={isFromMe ? "text-blue-300 text-[10px]" : "text-gray-400 text-[10px]"}>·</Text>
                                <Text className={`text-[10px] ${isFromMe ? "text-blue-200" : "text-gray-500"}`}>
                                  {getRelativeTime(message.sharedPost.createdAt)}
                                </Text>
                              </View>
                            </View>

                            {/* Body Content */}
                            <Text 
                              className={`text-[13px] leading-4 ${isFromMe ? "text-white" : "text-gray-800"}`} 
                              numberOfLines={3}
                            >
                              {message.sharedPost.content}
                            </Text>

                            {/* Optional Image */}
                            {message.sharedPost.image && (
                              <Image
                                source={{ uri: message.sharedPost.image }}
                                className="w-full h-28 rounded-lg mt-2 bg-gray-200"
                                resizeMode="cover"
                              />
                            )}

                            {/* Attachment tag / Footer */}
                            <View className="flex-row items-center mt-2.5 pt-1.5 border-t border-black/10">
                              <Feather name="share-2" size={10} color={isFromMe ? "#bfdbfe" : "#657786"} />
                              <Text className={`text-[9px] font-semibold ml-1 ${isFromMe ? "text-blue-200" : "text-gray-500"}`}>
                                Shared Post
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </TapGestureHandler>
                      )}

                      {/* Text Message or Deleted Placeholder */}
                      {(isDeleted || (message.text && !(message.sharedPost && message.text === "Shared a post"))) ? (
                        <TapGestureHandler
                          numberOfTaps={2}
                          onHandlerStateChange={(event) => {
                            if (event.nativeEvent.state === State.ACTIVE) {
                              handleReactToMessage(message._id, "❤️");
                            }
                          }}
                        >
                          <TouchableOpacity
                            onLongPress={isDeleted ? undefined : () => setSelectedMessageForReaction(message)}
                            activeOpacity={isDeleted ? 1 : 0.9}
                            className={`rounded-2xl px-4 py-3 ${
                              isDeleted
                                ? "bg-gray-100 border border-gray-200"
                                : isFromMe
                                ? vanishModeEnabled
                                  ? "bg-purple-600"
                                  : "bg-[#2b4afc]"
                                : vanishModeEnabled
                                ? "bg-slate-800 border border-slate-700"
                                : "bg-gray-100 border border-gray-100"
                            } ${isFromMe ? "rounded-tr-none" : "rounded-tl-none"} ${message.sending ? "opacity-60" : ""}`}
                          >
                            <Text
                              className={
                                isDeleted
                                  ? "text-gray-400 italic text-base animate-pulse"
                                  : isFromMe
                                  ? "text-white text-base"
                                  : vanishModeEnabled
                                  ? "text-slate-100 text-base"
                                  : "text-gray-900 text-base"
                              }
                            >
                              {isDeleted ? "🚫 This message was deleted" : message.text}
                            </Text>
                          </TouchableOpacity>
                        </TapGestureHandler>
                      ) : null}

                      {/* Render Reactions Badge */}
                      {!isDeleted && message.reactions && message.reactions.length > 0 && (
                        <View className={`flex-row flex-wrap gap-1 mt-1 ${isFromMe ? "justify-end" : "justify-start"}`}>
                          {(() => {
                            const emojiCounts: { [emoji: string]: number } = {};
                            message.reactions.forEach((r) => {
                              if (r.emoji) {
                                emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1;
                              }
                            });

                            return Object.entries(emojiCounts).map(([emoji, count]) => (
                              <TouchableOpacity
                                key={emoji}
                                onPress={() => handleReactToMessage(message._id, emoji)}
                                className={`flex-row items-center bg-white border border-slate-100 rounded-full px-2 py-0.5 shadow-sm active:scale-95`}
                              >
                                <Text className="text-xs mr-0.5">{emoji}</Text>
                                {count > 1 && <Text className="text-[10px] text-gray-500 font-bold">{count}</Text>}
                              </TouchableOpacity>
                            ));
                          })()}
                        </View>
                      )}

                      {/* Timestamp and Checkmarks */}
                      <View className="flex-row items-center mt-1 px-1 gap-1">
                        <Text className="text-[10px] text-gray-400">
                          {formatTime(message.createdAt)}
                          {!isDeleted && message.edited && " (edited)"}
                        </Text>
                        {isFromMe && !isDeleted && (
                          <View className="flex-row items-center ml-1">
                            {message.read ? (
                              <View className="flex-row items-center">
                                <Feather name="check" size={12} color="#2b4afc" />
                                <Feather name="check" size={12} color="#2b4afc" style={{ marginLeft: -6 }} />
                              </View>
                            ) : (
                              <Feather name="check" size={12} color="#9ca3af" />
                            )}
                          </View>
                        )}
                      </View>

                      {/* Seen text right below last read message */}
                      {isLastMessage && isFromMe && !isDeleted && message.read && (
                        <Text className="text-[10px] text-slate-400 text-right mt-1 mr-2">
                          Seen
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
                </View>
              </ScrollView>
            )}

            {/* Selected Image/Audio Previews */}
            {selectedImageUri && (
              <View className="px-4 py-2 border-t border-gray-100 flex-row items-center bg-gray-50">
                <Image source={{ uri: selectedImageUri }} className="w-16 h-16 rounded-lg mr-3" />
                <Text className="text-sm text-gray-500 flex-1">Image selected ready to send</Text>
                <TouchableOpacity onPress={() => setSelectedImageUri(null)} className="p-2">
                  <Feather name="x" size={20} color="red" />
                </TouchableOpacity>
              </View>
            )}

            {recordedAudioUri && (
              <View className="px-4 py-2 border-t border-gray-100 flex-row items-center bg-gray-50">
                <Feather name="mic" size={20} color="#2b4afc" className="mr-3" />
                <Text className="text-sm text-gray-500 flex-1">Voice recording ready to send</Text>
                <TouchableOpacity onPress={() => setRecordedAudioUri(null)} className="p-2">
                  <Feather name="x" size={20} color="red" />
                </TouchableOpacity>
              </View>
            )}

            {/* Reply Preview Header */}
            {replyToMessage && (
              <View className="flex-row items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <View className="flex-1 border-l-4 border-blue-500 pl-3 py-0.5">
                  <Text className="text-xs text-blue-600 font-bold">
                    Replying to {replyToMessage.sender === dbUser?._id ? "yourself" : selectedUser.name}
                  </Text>
                  <Text className="text-gray-600 text-sm mt-0.5" numberOfLines={1}>
                    {replyToMessage.text || (replyToMessage.image ? "📷 Photo" : "🎵 Voice message")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyToMessage(null)} className="p-1 rounded-full bg-gray-200">
                  <Feather name="x" size={14} color="#657786" />
                </TouchableOpacity>
              </View>
            )}

            {/* Editing Preview Header */}
            {editingMessage && (
              <View className="flex-row items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <View className="flex-1 border-l-4 border-gray-500 pl-3 py-0.5">
                  <Text className="text-xs text-gray-600 font-bold">
                    Editing Message
                  </Text>
                  <Text className="text-gray-500 text-sm mt-0.5" numberOfLines={1}>
                    {editingMessage.text}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditingMessage(null);
                    setNewMessage("");
                  }}
                  className="p-1 rounded-full bg-gray-200"
                >
                  <Feather name="x" size={14} color="#657786" />
                </TouchableOpacity>
              </View>
            )}

            {/* Input Row Container */}
            <View className={`flex-row items-end p-2 border-t border-slate-100 bg-white ${vanishModeEnabled ? "bg-slate-900 border-slate-800" : ""}`}>
              
              {/* Conditionally show Camera and Voice icons if input text is empty */}
              {newMessage.trim() === "" && !selectedImageUri && !recordedAudioUri && (
                <View className="flex-row items-center mb-1.5 ml-1">
                  {/* Camera Quick-Snap Button */}
                  <TouchableOpacity onPress={takeQuickSnap} className="mr-3">
                    <Feather name="camera" size={22} color={vanishModeEnabled ? "#a78bfa" : "#2b4afc"} />
                  </TouchableOpacity>
                  
                  {/* Media Picker Button */}
                  <TouchableOpacity onPress={pickImage} className="mr-3">
                    <Feather name="image" size={22} color={vanishModeEnabled ? "#a78bfa" : "#2b4afc"} />
                  </TouchableOpacity>

                  {/* Audio Recording Button */}
                  <TouchableOpacity
                    onPressIn={startRecording}
                    onPressOut={stopRecording}
                    className="mr-2"
                  >
                    <Feather
                      name="mic"
                      size={22}
                      color={isRecording ? "red" : vanishModeEnabled ? "#a78bfa" : "#2b4afc"}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Capsule Text Input Wrapper */}
              <View className={`flex-1 bg-slate-100 rounded-full px-4 py-1.5 max-h-24 ${vanishModeEnabled ? "bg-slate-800" : ""}`}>
                {isRecording ? (
                  <Text className="text-red-500 font-medium py-1 animate-pulse text-sm">
                    Recording voice... Release to send.
                  </Text>
                ) : (
                  <TextInput
                    className={`text-sm py-1 text-slate-800 ${vanishModeEnabled ? "text-slate-200" : ""}`}
                    placeholder="Start a message..."
                    placeholderTextColor="#657786"
                    value={newMessage}
                    onChangeText={handleTextChange}
                    multiline={true}
                    style={{ maxHeight: 96 }}
                  />
                )}
              </View>

              {/* Send Text Button (Fades/conditionally renders if there is text) */}
              {(newMessage.trim() !== "" || selectedImageUri || recordedAudioUri) && (
                <TouchableOpacity
                  onPress={editingMessage ? handleSaveEdit : sendMessage}
                  className="px-3 pb-2.5"
                  disabled={!newMessage.trim() && !selectedImageUri && !recordedAudioUri}
                >
                  <Text className={`font-bold text-[15px] ${vanishModeEnabled ? "text-purple-400" : "text-[#2b4afc]"}`}>
                    Send
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Floating Emojis & Contextual Actions Modal */}
            <Modal
              visible={selectedMessageForReaction !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedMessageForReaction(null)}
            >
              <TouchableOpacity
                className="flex-1 bg-black/40 justify-center items-center px-4"
                activeOpacity={1}
                onPress={() => setSelectedMessageForReaction(null)}
              >
                <View className="bg-white rounded-3xl p-5 w-full max-w-sm items-center shadow-xl">
                  {/* Floating Emoji Bar */}
                  <View className="flex-row justify-between w-full bg-slate-50 rounded-full px-3 py-2.5 mb-4 shadow-sm border border-slate-100">
                    {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        onPress={() => {
                          if (selectedMessageForReaction) {
                            handleReactToMessage(selectedMessageForReaction._id, emoji);
                            setSelectedMessageForReaction(null);
                          }
                        }}
                        className="size-10 items-center justify-center bg-white rounded-full shadow-sm active:scale-90"
                      >
                        <Text className="text-xl">{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Contextual Action List */}
                  {selectedMessageForReaction && (
                    <View className="w-full space-y-1">
                      {/* Reply Option */}
                      <TouchableOpacity
                        onPress={() => {
                          setReplyToMessage(selectedMessageForReaction);
                          setSelectedMessageForReaction(null);
                        }}
                        className="flex-row items-center py-3 px-4 bg-slate-50 rounded-2xl w-full"
                      >
                        <Feather name="corner-up-left" size={16} color="#475569" className="mr-3" />
                        <Text className="text-slate-700 font-semibold text-[14px]">Reply</Text>
                      </TouchableOpacity>

                      {/* Copy Text Option */}
                      {selectedMessageForReaction.text && (
                        <TouchableOpacity
                          onPress={() => {
                            copyToClipboard(selectedMessageForReaction.text || "");
                            setSelectedMessageForReaction(null);
                          }}
                          className="flex-row items-center py-3 px-4 bg-slate-50 rounded-2xl w-full"
                        >
                          <Feather name="copy" size={16} color="#475569" className="mr-3" />
                          <Text className="text-slate-700 font-semibold text-[14px]">Copy Text</Text>
                        </TouchableOpacity>
                      )}

                      {/* Own message actions (Unsend, Edit) */}
                      {selectedMessageForReaction.sender === dbUser?._id && !selectedMessageForReaction.deleted ? (
                        <>
                          {selectedMessageForReaction.text && !(selectedMessageForReaction.sharedPost && selectedMessageForReaction.text === "Shared a post") && (
                            <TouchableOpacity
                              onPress={() => {
                                setEditingMessage(selectedMessageForReaction);
                                setNewMessage(selectedMessageForReaction.text || "");
                                setSelectedMessageForReaction(null);
                              }}
                              className="flex-row items-center py-3 px-4 bg-slate-50 rounded-2xl w-full"
                            >
                              <Feather name="edit-2" size={16} color="#475569" className="mr-3" />
                              <Text className="text-slate-700 font-semibold text-[14px]">Edit Message</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            onPress={() => {
                              handleDeleteMessage(selectedMessageForReaction._id);
                              setSelectedMessageForReaction(null);
                            }}
                            className="flex-row items-center py-3 px-4 bg-red-50 rounded-2xl w-full"
                          >
                            <Feather name="trash-2" size={16} color="#dc2626" className="mr-3" />
                            <Text className="text-red-600 font-bold text-[14px]">Unsend</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        /* Neighbor message actions (Forward, Block/Report) */
                        <>
                          <TouchableOpacity
                            onPress={() => {
                              setForwardingMessage(selectedMessageForReaction);
                              setForwardModalVisible(true);
                              setSelectedMessageForReaction(null);
                            }}
                            className="flex-row items-center py-3 px-4 bg-slate-50 rounded-2xl w-full"
                          >
                            <Feather name="share-2" size={16} color="#475569" className="mr-3" />
                            <Text className="text-slate-700 font-semibold text-[14px]">Forward</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setSelectedMessageForReaction(null);
                              handleBlockUser(selectedUser._id, selectedUser.username);
                            }}
                            className="flex-row items-center py-3 px-4 bg-red-50/50 rounded-2xl w-full"
                          >
                            <Feather name="slash" size={16} color="#dc2626" className="mr-3" />
                            <Text className="text-red-600 font-semibold text-[14px]">Block User</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setSelectedMessageForReaction(null);
                              handleReportUser(selectedUser._id);
                            }}
                            className="flex-row items-center py-3 px-4 bg-red-50/50 rounded-2xl w-full"
                          >
                            <Feather name="alert-triangle" size={16} color="#dc2626" className="mr-3" />
                            <Text className="text-red-600 font-semibold text-[14px]">Report User</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => setSelectedMessageForReaction(null)}
                    className="py-2.5 w-full items-center mt-3"
                  >
                    <Text className="text-gray-400 font-semibold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>

            {/* Full Screen Image Modal */}
            <Modal
              visible={fullScreenImageUri !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setFullScreenImageUri(null)}
            >
              <View className="flex-1 bg-black justify-center items-center">
                {/* Close Button */}
                <TouchableOpacity
                  onPress={() => setFullScreenImageUri(null)}
                  className="absolute top-12 right-6 z-10 bg-black/60 p-2.5 rounded-full"
                >
                  <Feather name="x" size={24} color="white" />
                </TouchableOpacity>

                {fullScreenImageUri && (
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setFullScreenImageUri(null)}
                    className="w-full h-full justify-center items-center"
                  >
                    <Image
                      source={{ uri: fullScreenImageUri }}
                      className="w-full h-full"
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
              </View>
            </Modal>

            {/* Forward Message Modal */}
            <Modal
              visible={forwardModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setForwardModalVisible(false);
                setForwardingMessage(null);
              }}
            >
              <TouchableOpacity
                className="flex-1 bg-black/40 justify-center items-center px-4"
                activeOpacity={1}
                onPress={() => {
                  setForwardModalVisible(false);
                  setForwardingMessage(null);
                }}
              >
                <View className="bg-white rounded-3xl p-6 w-full max-w-sm items-center shadow-xl">
                  <Text className="text-gray-900 font-bold text-base mb-4">Forward to Neighbor</Text>
                  <FlatList
                    data={conversationsList.slice(0, 5)}
                    keyExtractor={(item) => item.id}
                    className="w-full max-h-60"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => handleForwardMessage(item.user._id)}
                        className="flex-row items-center py-2.5 border-b border-gray-100 w-full"
                      >
                        <Image source={{ uri: item.user.avatar }} className="w-8 h-8 rounded-full mr-3 bg-gray-100" />
                        <View className="flex-1">
                          <Text className="font-semibold text-gray-955 text-sm">{item.user.name}</Text>
                          <Text className="text-gray-400 text-xs">@{item.user.username}</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color="#becbd6" />
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <Text className="text-gray-500 text-xs py-4 text-center">No recent conversations</Text>
                    }
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setForwardModalVisible(false);
                      setForwardingMessage(null);
                    }}
                    className="mt-4 py-2 w-full items-center"
                  >
                    <Text className="text-gray-400 font-semibold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default MessagesScreen;