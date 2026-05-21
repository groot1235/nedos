import asyncHandler from "express-async-handler";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { getClerkUserId } from "../utils/getClerkUserId.js";
import cloudinary from "../config/cloudinary.js";
import { io, getRecipientSocketId } from "../config/socket.js";

// @desc    Get all conversations for the current user
// @route   GET /api/messages/conversations
// @access  Private
export const getConversations = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const currentUserId = currentUser._id;

  // Find all messages where the current user is either sender or recipient
  const messages = await Message.find({
    $or: [{ sender: currentUserId }, { recipient: currentUserId }],
  }).sort({ createdAt: -1 });

  const conversationsMap = new Map();

  for (const msg of messages) {
    const otherUserId = msg.sender.toString() === currentUserId.toString()
      ? msg.recipient.toString()
      : msg.sender.toString();

    if (!conversationsMap.has(otherUserId)) {
      conversationsMap.set(otherUserId, msg);
    }
  }

  // Fetch ALL other users except the current logged-in user
  const allOtherUsers = await User.find({ _id: { $ne: currentUserId } })
    .select("username firstName lastName profilePicture");

  const conversations = allOtherUsers.map(user => {
    const lastMsg = conversationsMap.get(user._id.toString());
    let lastMessageText = "Start a conversation";
    let time = user.createdAt;
    let timestamp = user.createdAt;
    let hasMessage = false;

    if (lastMsg) {
      hasMessage = true;
      time = lastMsg.createdAt;
      timestamp = lastMsg.createdAt;
      if (lastMsg.text) {
        lastMessageText = lastMsg.text;
      } else if (lastMsg.image) {
        lastMessageText = "📷 Image";
      } else if (lastMsg.audio) {
        lastMessageText = "🎵 Voice message";
      }
    }

    return {
      id: user._id,
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`.trim() || user.username,
        username: user.username,
        avatar: user.profilePicture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
        verified: false,
      },
      lastMessage: lastMessageText,
      time,
      timestamp,
      hasMessage,
    };
  });

  // Sort conversations: active conversations first (newest message first), then other users
  conversations.sort((a, b) => {
    if (a.hasMessage && !b.hasMessage) return -1;
    if (!a.hasMessage && b.hasMessage) return 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  res.status(200).json({ conversations });
});

// @desc    Get chat history between current user and another user
// @route   GET /api/messages/:otherUserId
// @access  Private
export const getMessages = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { otherUserId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const currentUserId = currentUser._id;

  const messages = await Message.find({
    $or: [
      { sender: currentUserId, recipient: otherUserId },
      { sender: otherUserId, recipient: currentUserId },
    ],
  }).sort({ createdAt: 1 });

  res.status(200).json({ messages });
});

// @desc    Send a message
// @route   POST /api/messages/send/:recipientId
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { recipientId } = req.params;
  const { text } = req.body;
  const file = req.file;

  const senderUser = await User.findOne({ clerkId: userId });
  if (!senderUser) return res.status(404).json({ error: "Sender not found" });

  let imageUrl = "";
  let audioUrl = "";

  if (file) {
    try {
      const base64File = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      
      const uploadResponse = await cloudinary.uploader.upload(base64File, {
        folder: "messages_media",
        resource_type: "auto",
      });

      if (file.mimetype.startsWith("image/")) {
        imageUrl = uploadResponse.secure_url;
      } else if (file.mimetype.startsWith("audio/")) {
        audioUrl = uploadResponse.secure_url;
      }
    } catch (uploadError) {
      console.error("Cloudinary upload error in messaging:", uploadError);
      return res.status(400).json({ error: "Failed to upload media file" });
    }
  }

  if (!text && !imageUrl && !audioUrl) {
    return res.status(400).json({ error: "Cannot send an empty message" });
  }

  const message = await Message.create({
    sender: senderUser._id,
    recipient: recipientId,
    text: text || "",
    image: imageUrl,
    audio: audioUrl,
  });

  // Emit real-time message via socket.io
  const recipientSocketId = getRecipientSocketId(recipientId);
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("newMessage", message);
  }

  res.status(201).json({ message });
});
