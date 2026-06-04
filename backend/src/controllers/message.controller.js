import asyncHandler from "express-async-handler";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { getClerkUserId } from "../utils/getClerkUserId.js";
import cloudinary from "../config/cloudinary.js";
import { io, getRecipientSocketId } from "../config/socket.js";
import { sendPushNotification } from "../utils/pushNotification.js";

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

  // Fetch other users except the current user and excluding blocked users on either side
  const allOtherUsers = await User.find({
    $and: [
      { _id: { $ne: currentUserId } },
      { _id: { $nin: currentUser.blockedUsers || [] } },
      { blockedUsers: { $ne: currentUserId } },
    ],
  }).select("username firstName lastName profilePicture");

  const conversations = await Promise.all(
    allOtherUsers.map(async (user) => {
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

      const unreadCount = await Message.countDocuments({
        sender: user._id,
        recipient: currentUserId,
        read: false,
      });

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
        unreadCount,
      };
    })
  );

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

  const otherUser = await User.findById(otherUserId);
  if (!otherUser) return res.status(404).json({ error: "User not found" });

  const isBlockedByUs = currentUser.blockedUsers?.includes(otherUserId);
  const isBlockedByThem = otherUser.blockedUsers?.includes(currentUserId);

  if (isBlockedByUs || isBlockedByThem) {
    return res.status(403).json({ error: "Cannot access messages. Block in place." });
  }

  // Delete read vanish messages before loading chat history
  await Message.deleteMany({
    $or: [
      { sender: currentUserId, recipient: otherUserId },
      { sender: otherUserId, recipient: currentUserId },
    ],
    vanish: true,
    read: true,
  });

  // Mark all unread messages from otherUserId to currentUserId as read
  await Message.updateMany(
    { sender: otherUserId, recipient: currentUserId, read: false },
    { $set: { read: true } }
  );

  const messages = await Message.find({
    $or: [
      { sender: currentUserId, recipient: otherUserId },
      { sender: otherUserId, recipient: currentUserId },
    ],
  })
    .sort({ createdAt: 1 })
    .populate("reactions.userId", "username firstName lastName")
    .populate({
      path: "replyTo",
      populate: {
        path: "sender",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "sharedPost",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    });

  res.status(200).json({ messages });
});

// @desc    Send a message
// @route   POST /api/messages/send/:recipientId
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { recipientId } = req.params;
  const { text, replyTo, sharedPost } = req.body;
  const file = req.file;

  const senderUser = await User.findOne({ clerkId: userId });
  if (!senderUser) return res.status(404).json({ error: "Sender not found" });

  const recipientUser = await User.findById(recipientId);
  if (!recipientUser) return res.status(404).json({ error: "Recipient not found" });

  const isBlockedByUs = senderUser.blockedUsers?.includes(recipientId);
  const isBlockedByThem = recipientUser.blockedUsers?.includes(senderUser._id);

  if (isBlockedByUs || isBlockedByThem) {
    return res.status(403).json({ error: "Cannot send message. Block in place." });
  }

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

  if (!text && !imageUrl && !audioUrl && !sharedPost) {
    return res.status(400).json({ error: "Cannot send an empty message" });
  }

  const message = await Message.create({
    sender: senderUser._id,
    recipient: recipientId,
    text: text || "",
    image: imageUrl,
    audio: audioUrl,
    replyTo: replyTo || null,
    sharedPost: sharedPost || null,
    vanish: req.body.vanishMode || false,
  });

  const populatedMessage = await Message.findById(message._id)
    .populate({
      path: "replyTo",
      populate: {
        path: "sender",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "sharedPost",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    });

  // Emit real-time message via socket.io
  const recipientSocketId = getRecipientSocketId(recipientId);
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("newMessage", populatedMessage);
  }

  // Dispatch Push Notification to Recipient
  if (recipientUser && recipientUser.expoPushToken) {
    const senderName = `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim() || senderUser.username;
    sendPushNotification(
      recipientUser.expoPushToken,
      "New Message",
      `${senderName}: ${text || (imageUrl ? "📷 Photo" : "🎵 Voice message")}`,
      { senderId: senderUser._id.toString() }
    );
  }

  res.status(201).json({ message: populatedMessage });
});

// @desc    React to a message
// @route   POST /api/messages/:messageId/react
// @access  Private
export const reactToMessage = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { messageId } = req.params;
  const { emoji } = req.body;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const message = await Message.findById(messageId);
  if (!message) return res.status(404).json({ error: "Message not found" });

  // Check if user has already reacted with an emoji
  const existingReactionIndex = message.reactions.findIndex(
    (r) => r.userId.toString() === currentUser._id.toString()
  );

  if (existingReactionIndex > -1) {
    if (message.reactions[existingReactionIndex].emoji === emoji) {
      // Remove reaction if it's the same emoji (toggle off)
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Update reaction emoji
      message.reactions[existingReactionIndex].emoji = emoji;
    }
  } else {
    // Add new reaction
    message.reactions.push({
      userId: currentUser._id,
      emoji,
    });
  }

  await message.save();

  // Populate reactions user info
  const updatedMessage = await Message.findById(messageId).populate("reactions.userId", "username firstName lastName");

  // Emit reaction update via socket.io to recipient and sender
  const recipientSocketId = getRecipientSocketId(message.recipient);
  const senderSocketId = getRecipientSocketId(message.sender);

  if (recipientSocketId) {
    io.to(recipientSocketId).emit("messageReaction", { messageId, reactions: updatedMessage.reactions });
  }
  if (senderSocketId) {
    io.to(senderSocketId).emit("messageReaction", { messageId, reactions: updatedMessage.reactions });
  }

  res.status(200).json({ message: updatedMessage });
});

// @desc    Mark all messages from senderId as read
// @route   PUT /api/messages/read/:senderId
// @access  Private
export const markAsRead = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { senderId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  await Message.updateMany(
    { sender: senderId, recipient: currentUser._id, read: false },
    { $set: { read: true } }
  );

  // Emit socket event to the sender (so they get real-time double blue checkmarks)
  const senderSocketId = getRecipientSocketId(senderId);
  if (senderSocketId) {
    io.to(senderSocketId).emit("messagesRead", {
      senderId,
      recipientId: currentUser._id,
    });
  }

  res.status(200).json({ success: true });
});

// @desc    Edit a message
// @route   PUT /api/messages/:messageId
// @access  Private
export const editMessage = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { messageId } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Message text is required" });
  }

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const message = await Message.findById(messageId);
  if (!message) return res.status(404).json({ error: "Message not found" });

  // Check ownership
  if (message.sender.toString() !== currentUser._id.toString()) {
    return res.status(403).json({ error: "You can only edit your own messages" });
  }

  if (message.deleted) {
    return res.status(400).json({ error: "Cannot edit a deleted message" });
  }

  message.text = text;
  message.edited = true;
  await message.save();

  const populatedMessage = await Message.findById(messageId)
    .populate({
      path: "replyTo",
      populate: {
        path: "sender",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "sharedPost",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    });

  // Emit socket event to both sender and recipient to keep screens in sync
  const recipientSocketId = getRecipientSocketId(message.recipient);
  const senderSocketId = getRecipientSocketId(message.sender);

  if (recipientSocketId) {
    io.to(recipientSocketId).emit("messageEdited", populatedMessage);
  }
  if (senderSocketId) {
    io.to(senderSocketId).emit("messageEdited", populatedMessage);
  }

  res.status(200).json({ message: populatedMessage });
});

// @desc    Delete a message
// @route   DELETE /api/messages/:messageId
// @access  Private
export const deleteMessage = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { messageId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const message = await Message.findById(messageId);
  if (!message) return res.status(404).json({ error: "Message not found" });

  // Check ownership
  if (message.sender.toString() !== currentUser._id.toString()) {
    return res.status(403).json({ error: "You can only delete your own messages" });
  }

  message.deleted = true;
  message.text = "This message was deleted";
  message.image = "";
  message.audio = "";
  message.replyTo = null;
  message.sharedPost = null;
  await message.save();

  // Emit socket event to both sender and recipient
  const recipientSocketId = getRecipientSocketId(message.recipient);
  const senderSocketId = getRecipientSocketId(message.sender);

  if (recipientSocketId) {
    io.to(recipientSocketId).emit("messageDeleted", { messageId, senderId: message.sender, recipientId: message.recipient });
  }
  if (senderSocketId) {
    io.to(senderSocketId).emit("messageDeleted", { messageId, senderId: message.sender, recipientId: message.recipient });
  }

  res.status(200).json({ success: true, message });
});

// @desc    Clean up read vanish messages on chat close
// @route   PUT /api/messages/vanish/cleanup/:otherUserId
// @access  Private
export const vanishCleanup = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { otherUserId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  const currentUserId = currentUser._id;

  // Delete read vanish messages between these users
  await Message.deleteMany({
    $or: [
      { sender: currentUserId, recipient: otherUserId },
      { sender: otherUserId, recipient: currentUserId },
    ],
    vanish: true,
    read: true,
  });

  // Emit socket event to both users to update screens in real-time
  const recipientSocketId = getRecipientSocketId(otherUserId);
  const senderSocketId = getRecipientSocketId(currentUserId);

  if (recipientSocketId) {
    io.to(recipientSocketId).emit("messagesVanished", { senderId: currentUserId });
  }
  if (senderSocketId) {
    io.to(senderSocketId).emit("messagesVanished", { senderId: currentUserId });
  }

  res.status(200).json({ success: true });
});
