import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
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

const MessagesScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { getToken } = useAuth();
  const { dbUser } = useUserContext();
  const { socket, onlineUsers } = useSocket();

  const [searchText, setSearchText] = useState("");
  const [conversationsList, setConversationsList] = useState<ConversationType[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  
  const [selectedUser, setSelectedUser] = useState<ConversationUser | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeMessages, setActiveMessages] = useState<DbMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);

  // Inputs
  const [newMessage, setNewMessage] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);

  // Audio Recording states
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchConversations();
  }, [dbUser?._id]);

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

  // Real-time socket message handler
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: DbMessage) => {
      // If we are currently chatting with the sender (or the recipient is the other user of active chat)
      if (
        isChatOpen &&
        selectedUser &&
        (message.sender === selectedUser._id || message.recipient === selectedUser._id)
      ) {
        setActiveMessages((prev) => [...prev, message]);
      }
      // Re-fetch conversations to update the latest messages
      fetchConversations();
    };

    socket.on("newMessage", handleNewMessage);

    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, [socket, isChatOpen, selectedUser?._id]);

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

  const openConversation = async (user: ConversationUser) => {
    setSelectedUser(user);
    setIsChatOpen(true);
    setIsMessagesLoading(true);

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/messages/${user._id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setActiveMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const closeChatModal = () => {
    setIsChatOpen(false);
    setSelectedUser(null);
    setActiveMessages([]);
    setNewMessage("");
    setSelectedImageUri(null);
    setRecordedAudioUri(null);
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
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission Required", "Permission to access microphone is required!");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Error", "Could not start audio recording");
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedAudioUri(uri);
      setSelectedImageUri(null); // exclusive media inputs
      setRecording(null);
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  };

  // Message Sending
  const sendMessage = async () => {
    if (!selectedUser) return;

    const textToSend = newMessage.trim();
    const imageUri = selectedImageUri;
    const audioUri = recordedAudioUri;

    if (!textToSend && !imageUri && !audioUri) return;

    // Reset inputs immediately for fast feedback
    setNewMessage("");
    setSelectedImageUri(null);
    setRecordedAudioUri(null);

    try {
      const token = await getToken();
      const formData = new FormData();

      if (textToSend) {
        formData.append("text", textToSend);
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

  // Format time display
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return timeStr;
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
      ) : filteredConversations.length === 0 ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-gray-500 text-lg text-center font-medium">No conversations yet</Text>
          <Text className="text-gray-400 text-sm text-center mt-2">
            Search for people to start chatting!
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        >
          {filteredConversations.map((conversation) => {
            const isOnline = onlineUsers.includes(conversation.user._id);
            return (
              <TouchableOpacity
                key={conversation.id}
                className="flex-row items-center p-4 border-b border-gray-50 active:bg-gray-50"
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
                      <Text className="font-semibold text-gray-900 mr-1" numberOfLines={1}>
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
                  <Text className="text-sm text-gray-500" numberOfLines={1}>
                    {conversation.lastMessage}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* CHAT MODAL */}
      <Modal visible={isChatOpen} animationType="slide" presentationStyle="pageSheet">
        {selectedUser && (
          <SafeAreaView className="flex-1 bg-white">
            {/* Chat Header */}
            <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
              <TouchableOpacity onPress={closeChatModal} className="mr-3">
                <Feather name="arrow-left" size={24} color="#2b4afc" />
              </TouchableOpacity>
              <View className="relative mr-3">
                <Image
                  source={{ uri: selectedUser.avatar }}
                  className="size-10 rounded-full"
                />
                {onlineUsers.includes(selectedUser._id) && (
                  <View className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-white" />
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="font-semibold text-gray-900 mr-1">
                    {selectedUser.name}
                  </Text>
                  {selectedUser.verified && (
                    <Feather name="check-circle" size={14} color="#2b4afc" />
                  )}
                </View>
                <Text className="text-gray-500 text-xs">@{selectedUser.username}</Text>
              </View>
            </View>

            {/* Chat Messages Area */}
            {isMessagesLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="small" color="#2b4afc" />
              </View>
            ) : (
              <ScrollView className="flex-1 px-4 py-4" ref={scrollViewRef}>
                <View className="mb-4">
                  <Text className="text-center text-gray-400 text-xs mb-6">
                    This is the beginning of your conversation with {selectedUser.name}
                  </Text>

                  {/* Conversation Messages */}
                  {activeMessages.map((message) => {
                    const isFromMe = message.sender === dbUser?._id;
                    return (
                      <View
                        key={message._id}
                        className={`flex-row mb-4 ${isFromMe ? "justify-end" : ""}`}
                      >
                        {!isFromMe && (
                          <Image
                            source={{ uri: selectedUser.avatar }}
                            className="size-8 rounded-full mr-2 self-end mb-4"
                          />
                        )}
                        <View className={`flex-col max-w-[75%] ${isFromMe ? "items-end" : "items-start"}`}>
                          {/* Image Message */}
                          {message.image && (
                            <Image
                              source={{ uri: message.image }}
                              className="w-56 h-40 rounded-2xl mb-1 resize-cover"
                            />
                          )}

                          {/* Audio/Voice Message */}
                          {message.audio && <VoicePlayer audioUrl={message.audio} />}

                          {/* Text Message */}
                          {message.text ? (
                            <View
                              className={`rounded-2xl px-4 py-3 ${
                                isFromMe ? "bg-[#2b4afc]" : "bg-gray-100"
                              }`}
                            >
                              <Text className={isFromMe ? "text-white text-base" : "text-gray-900 text-base"}>
                                {message.text}
                              </Text>
                            </View>
                          ) : null}
                          
                          <Text className="text-[10px] text-gray-400 mt-1 px-1">
                            {formatTime(message.createdAt)}
                          </Text>
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

            {/* Message Input Controls */}
            <View className="flex-row items-center px-4 py-3 border-t border-gray-100 bg-white">
              {/* Media Picker Button */}
              <TouchableOpacity onPress={pickImage} className="mr-3" disabled={isRecording}>
                <Feather name="image" size={24} color={isRecording ? "#becbd6" : "#2b4afc"} />
              </TouchableOpacity>

              {/* Audio Recording Button */}
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                className="mr-3"
              >
                <Feather
                  name="mic"
                  size={24}
                  color={isRecording ? "red" : "#2b4afc"}
                />
              </TouchableOpacity>

              {/* TextInput / Recording Status */}
              <View className="flex-1 flex-row items-center bg-gray-100 rounded-full px-4 py-2 mr-3">
                {isRecording ? (
                  <Text className="text-red-500 font-medium py-1 animate-pulse">
                    Recording voice... Release to finish.
                  </Text>
                ) : (
                  <TextInput
                    className="flex-1 text-base text-gray-900 max-h-20"
                    placeholder="Start a message..."
                    placeholderTextColor="#657786"
                    value={newMessage}
                    onChangeText={setNewMessage}
                    multiline
                  />
                )}
              </View>

              {/* Send Button */}
              <TouchableOpacity
                onPress={sendMessage}
                className={`size-10 rounded-full items-center justify-center ${
                  newMessage.trim() || selectedImageUri || recordedAudioUri
                    ? "bg-[#2b4afc]"
                    : "bg-gray-300"
                }`}
                disabled={!newMessage.trim() && !selectedImageUri && !recordedAudioUri}
              >
                <Feather name="send" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default MessagesScreen;